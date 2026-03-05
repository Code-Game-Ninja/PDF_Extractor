/**
 * ============================================
 * Hybrid Text Extractor
 * ============================================
 * 
 * Smart extraction that combines two strategies:
 * 
 * 1. DIGITAL EXTRACTION (pdf-parse):
 *    Reads the embedded text layer directly from the PDF.
 *    Works perfectly for PDFs with selectable text, even when
 *    pdfjs-dist can't render the fonts visually.
 * 
 * 2. OCR EXTRACTION (Vision API):
 *    Renders pages to images and sends to Google Cloud Vision API.
 *    Required for scanned/image-based PDFs that have no text layer.
 * 
 * The extractor automatically detects which method to use per-page:
 * - If digital text is found → uses it directly (faster, 100% accurate)
 * - If no digital text → renders + preprocesses image → OCR
 * 
 * Image preprocessing with Sharp improves OCR on low-quality scans:
 * - Grayscale conversion
 * - Contrast normalization
 * - Sharpening
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const sharp = require('sharp');
const { convertToImages } = require('./pdfConverter');
const { extractTextFromImage } = require('../services/visionOCR');

// Minimum characters per page to consider digital text "present"
const MIN_TEXT_THRESHOLD = 20;

/**
 * Extracts text from a PDF using the best available method per page.
 * 
 * @param {string} pdfPath - Absolute path to the PDF file.
 * @param {string} apiKey - Google Cloud Vision API key.
 * @param {Object} options - Extraction options.
 * @param {number} [options.scale=2.5] - Render scale for OCR pages.
 * @returns {Promise<Object>} Structured extraction result.
 */
async function extractFromPdf(pdfPath, apiKey, options = {}) {
  const { scale = 2.5 } = options;
  const pdfBuffer = fs.readFileSync(pdfPath);

  // ============================================
  // Step 1: Try digital text extraction first
  // ============================================
  console.log('[HybridExtractor] Step 1: Extracting digital text layer...');

  let digitalText = null;
  let digitalPages = [];
  try {
    digitalText = await pdfParse(pdfBuffer, {
      // Custom page renderer to get per-page text
      pagerender: async function(pageData) {
        const textContent = await pageData.getTextContent();
        // Reconstruct text preserving reading order
        const items = textContent.items;
        let lastY = null;
        let text = '';
        for (const item of items) {
          // Detect line breaks by Y-position changes
          const currentY = Math.round(item.transform[5]);
          if (lastY !== null && Math.abs(currentY - lastY) > 5) {
            text += '\n';
          } else if (lastY !== null) {
            text += ' ';
          }
          text += item.str;
          lastY = currentY;
        }
        return text.trim();
      }
    });

    // pdf-parse returns all pages combined, but our custom renderer
    // gives us per-page text in digitalText.text split by form-feeds
    // Actually pdf-parse concatenates pages. Let's parse per-page differently.
  } catch (err) {
    console.log(`[HybridExtractor] pdf-parse failed: ${err.message}. Will use OCR for all pages.`);
  }

  // ============================================
  // Step 2: Get per-page digital text using pdfjs directly
  // ============================================
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  
  // FIX FOR VERCEL: Force bundler to include worker file
  try {
    require('pdfjs-dist/legacy/build/pdf.worker.js');
  } catch (e) {}

  const { createCanvas } = require('canvas');

  class MinimalCanvasFactory {
    create(w, h) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }
    reset(cc, w, h) { cc.canvas.width = w; cc.canvas.height = h; }
    destroy(cc) { cc.canvas = null; cc.context = null; }
  }

  const pdfData = new Uint8Array(pdfBuffer);
  const pdfDoc = await pdfjsLib.getDocument({
    data: pdfData,
    canvasFactory: new MinimalCanvasFactory(),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;

  const totalPages = pdfDoc.numPages;
  console.log(`[HybridExtractor] PDF has ${totalPages} page(s)`);

  // Extract digital text per page
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    let lastY = null;
    let pageText = '';
    const words = [];

    for (const item of textContent.items) {
      const currentY = Math.round(item.transform[5]);
      if (item.str.trim()) {
        if (lastY !== null && Math.abs(currentY - lastY) > 3) {
          pageText += '\n';
        } else if (lastY !== null && pageText.length > 0) {
          pageText += ' ';
        }
        pageText += item.str;
        words.push(item.str);
        lastY = currentY;
      }
    }

    digitalPages.push({
      pageNumber: i,
      text: pageText.trim(),
      wordCount: words.length,
      hasDigitalText: pageText.trim().length >= MIN_TEXT_THRESHOLD,
    });

    page.cleanup();
  }
  pdfDoc.cleanup();

  // ============================================
  // Step 3: Determine extraction method per page
  // ============================================
  const digitalCount = digitalPages.filter(p => p.hasDigitalText).length;
  const ocrNeededCount = totalPages - digitalCount;

  console.log(`[HybridExtractor] Digital text found: ${digitalCount}/${totalPages} pages`);
  console.log(`[HybridExtractor] OCR needed: ${ocrNeededCount} pages`);

  // ============================================
  // Step 4: Render + OCR for pages without digital text
  // ============================================
  let renderedPages = [];
  if (ocrNeededCount > 0) {
    console.log(`[HybridExtractor] Rendering ${ocrNeededCount} pages for OCR (scale: ${scale}x)...`);

    try {
      // Render ALL pages but we'll only OCR the ones that need it
      renderedPages = await convertToImages(pdfPath, { scale });
    } catch (err) {
      console.error(`[HybridExtractor] Page rendering failed: ${err.message}`);
    }
  }

  // ============================================
  // Step 5: Build combined results
  // ============================================
  const results = [];
  let combinedText = '';

  for (let i = 0; i < totalPages; i++) {
    const pageNum = i + 1;
    const digital = digitalPages[i];

    if (digital.hasDigitalText) {
      // Use digital text directly — it's 100% accurate
      console.log(`[HybridExtractor] Page ${pageNum}: Using digital text (${digital.wordCount} words)`);

      const lines = digital.text.split('\n').map(l => ({ text: l.trim() })).filter(l => l.text);
      const wordsList = digital.text.split(/\s+/).filter(w => w).map(w => ({
        text: w,
        confidence: 1.0,
        boundingBox: null,
      }));

      results.push({
        pageNumber: pageNum,
        method: 'digital',
        fullText: digital.text,
        blocks: [{
          type: 'TEXT',
          confidence: 1.0,
          boundingBox: null,
          paragraphs: [{
            confidence: 1.0,
            text: digital.text,
            lines: lines,
            words: wordsList,
          }],
        }],
        lines: lines,
        words: wordsList,
        confidence: 1.0,
      });
    } else {
      // Need OCR — render, preprocess, and send to Vision API
      console.log(`[HybridExtractor] Page ${pageNum}: Using Vision API OCR...`);

      const rendered = renderedPages.find(p => p.pageNumber === pageNum);
      if (rendered) {
        try {
          // Preprocess the image for better OCR
          const processedBuffer = await preprocessImage(rendered.imageBuffer);

          const ocrResult = await extractTextFromImage(processedBuffer, apiKey);
          results.push({
            pageNumber: pageNum,
            method: 'ocr',
            width: rendered.width,
            height: rendered.height,
            ...ocrResult,
          });
        } catch (err) {
          console.error(`[HybridExtractor] OCR failed for page ${pageNum}: ${err.message}`);
          results.push({
            pageNumber: pageNum,
            method: 'ocr',
            error: err.message,
            fullText: '',
            blocks: [],
            lines: [],
            words: [],
            confidence: 0,
          });
        }
      } else {
        results.push({
          pageNumber: pageNum,
          method: 'failed',
          error: 'Could not render page for OCR',
          fullText: '',
          blocks: [],
          lines: [],
          words: [],
          confidence: 0,
        });
      }
    }

    // Build combined text
    const pageText = results[results.length - 1].fullText;
    if (pageText) {
      combinedText += (combinedText ? '\n\n--- Page ' + pageNum + ' ---\n\n' : '') + pageText;
    }
  }

  return {
    totalPages,
    pages: results,
    combinedText,
    successfulPages: results.filter(r => !r.error).length,
    failedPages: results.filter(r => r.error).length,
    digitalPages: results.filter(r => r.method === 'digital').length,
    ocrPages: results.filter(r => r.method === 'ocr').length,
  };
}

/**
 * Preprocesses an image buffer for better OCR accuracy.
 * 
 * Applies:
 * - Grayscale conversion (removes color noise)
 * - Contrast normalization (auto-levels)
 * - Sharpening (makes text edges crisper)
 * - Outputs high-quality PNG
 * 
 * @param {Buffer} imageBuffer - Raw PNG image buffer.
 * @returns {Promise<Buffer>} Preprocessed PNG image buffer.
 */
async function preprocessImage(imageBuffer) {
  try {
    const processed = await sharp(imageBuffer)
      .grayscale()                          // Convert to grayscale
      .normalize()                          // Auto-adjust contrast (stretch histogram)
      .sharpen({ sigma: 1.5 })              // Sharpen text edges
      .png({ quality: 100 })                // High quality PNG output
      .toBuffer();

    console.log(`[ImagePreprocess] ${(imageBuffer.length / 1024).toFixed(0)} KB → ${(processed.length / 1024).toFixed(0)} KB (grayscale + normalized + sharpened)`);
    return processed;
  } catch (err) {
    console.warn(`[ImagePreprocess] Preprocessing failed, using original: ${err.message}`);
    return imageBuffer; // Fall back to original
  }
}

module.exports = {
  extractFromPdf,
  preprocessImage,
};
