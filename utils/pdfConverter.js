/**
 * ============================================
 * PDF to Image Converter Utility
 * ============================================
 * 
 * Converts PDF pages into PNG image buffers using pdfjs-dist v3
 * and node-canvas for server-side rendering. This enables OCR
 * processing of both digital and scanned PDFs.
 * 
 * Uses pdfjs-dist@3.11.174 (legacy build) for reliable Node.js
 * canvas compatibility. v4+ has breaking changes with node-canvas.
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// ============================================
// Load pdfjs-dist v3 (CommonJS legacy build)
// ============================================
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

// 🔴 FIX FOR VERCEL SERVERLESS ENVIRONMENTS
// pdfjs-dist dynamically requires its worker file, which Vercel's bundler ignores.
// We statically require it here so Vercel includes it in the final deployment.
try {
  require('pdfjs-dist/legacy/build/pdf.worker.js');
} catch (e) {
  // Ignore any execution errors from the worker script itself
}

/**
 * Custom Canvas Factory for pdfjs-dist.
 * 
 * pdfjs-dist requires a canvas factory to create canvas elements
 * in Node.js (since there's no DOM). This factory uses node-canvas
 * to provide compatible Canvas and Context2D objects.
 */
class NodeCanvasFactory {
  /**
   * Creates a new canvas with the given dimensions.
   * @param {number} width - Canvas width in pixels.
   * @param {number} height - Canvas height in pixels.
   * @returns {{ canvas: Canvas, context: CanvasRenderingContext2D }}
   */
  create(width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid canvas dimensions: ${width}x${height}`);
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  /**
   * Resets an existing canvas to new dimensions.
   * @param {{ canvas: Canvas, context: CanvasRenderingContext2D }} canvasAndContext
   * @param {number} width - New width.
   * @param {number} height - New height.
   */
  reset(canvasAndContext, width, height) {
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas is not specified');
    }
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  /**
   * Destroys a canvas and releases its resources.
   * @param {{ canvas: Canvas, context: CanvasRenderingContext2D }} canvasAndContext
   */
  destroy(canvasAndContext) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

// Create a shared factory instance
const canvasFactory = new NodeCanvasFactory();

/**
 * Converts all pages of a PDF file into PNG image buffers.
 * 
 * @param {string} pdfPath - Absolute path to the PDF file.
 * @param {Object} options - Conversion options.
 * @param {number} [options.scale=2.0] - Render scale (higher = better quality, larger images).
 *                                        2.0 ≈ 200 DPI, good balance for OCR.
 * @returns {Promise<Array<{pageNumber: number, imageBuffer: Buffer, width: number, height: number}>>}
 *          Array of objects containing page number and PNG image buffer.
 * @throws {Error} If the PDF cannot be loaded or a page fails to render.
 */
async function convertToImages(pdfPath, options = {}) {
  const { scale = 2.0 } = options;

  // Validate that the file exists
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  // Read the PDF file into a Uint8Array
  const pdfData = new Uint8Array(fs.readFileSync(pdfPath));

  // Load the PDF document with node-canvas factory
  let pdfDocument;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      canvasFactory: canvasFactory,
      // Use standard fonts bundled with pdfjs-dist
      useSystemFonts: true,
      // Disable worker thread (not needed in Node.js)
      isEvalSupported: false,
      disableFontFace: true,
    });
    pdfDocument = await loadingTask.promise;
  } catch (err) {
    throw new Error(`Failed to load PDF: ${err.message}. The file may be corrupted or password-protected.`);
  }

  const totalPages = pdfDocument.numPages;
  console.log(`[PDFConverter] Loaded PDF with ${totalPages} page(s). Scale: ${scale}x`);

  const results = [];

  // Process each page sequentially to manage memory
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    try {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale });

      // Create a canvas matching the scaled page dimensions
      const canvasAndContext = canvasFactory.create(
        Math.floor(viewport.width),
        Math.floor(viewport.height)
      );
      const { canvas, context } = canvasAndContext;

      // Fill with white background (critical for scanned PDFs and OCR accuracy)
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);

      // Render the PDF page onto the canvas
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        canvasFactory: canvasFactory,
      };

      await page.render(renderContext).promise;

      // Convert the canvas to a PNG buffer
      const imageBuffer = canvas.toBuffer('image/png');

      results.push({
        pageNumber: pageNum,
        imageBuffer,
        width: canvas.width,
        height: canvas.height,
      });

      console.log(`[PDFConverter] Page ${pageNum}/${totalPages} rendered (${canvas.width}x${canvas.height}px, ${(imageBuffer.length / 1024).toFixed(0)} KB)`);

      // Clean up this page's canvas to free memory
      canvasFactory.destroy(canvasAndContext);
      page.cleanup();
    } catch (err) {
      console.error(`[PDFConverter] Error rendering page ${pageNum}: ${err.message}`);
      throw new Error(`Failed to render page ${pageNum}: ${err.message}`);
    }
  }

  // Clean up the document
  pdfDocument.cleanup();

  return results;
}

/**
 * Gets metadata about a PDF file without rendering pages.
 * 
 * @param {string} pdfPath - Absolute path to the PDF file.
 * @returns {Promise<{totalPages: number, info: Object}>} PDF metadata.
 */
async function getPdfInfo(pdfPath) {
  const pdfData = new Uint8Array(fs.readFileSync(pdfPath));
  const pdfDocument = await pdfjsLib.getDocument({
    data: pdfData,
    canvasFactory: canvasFactory,
  }).promise;
  const metadata = await pdfDocument.getMetadata();

  const info = {
    totalPages: pdfDocument.numPages,
    info: metadata?.info || {},
  };

  pdfDocument.cleanup();
  return info;
}

module.exports = {
  convertToImages,
  getPdfInfo,
};
