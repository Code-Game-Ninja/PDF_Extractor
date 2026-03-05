/**
 * ============================================
 * Google Cloud Vision API OCR Service
 * ============================================
 * 
 * Handles communication with the Google Cloud Vision API
 * for Optical Character Recognition (OCR). Uses the
 * DOCUMENT_TEXT_DETECTION feature for best results with
 * printed and handwritten text.
 * 
 * The service sends base64-encoded images to the REST API
 * and parses the structured response into organized text data.
 */

const axios = require('axios');

// Base URL for the Vision API
const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Extracts text from an image buffer using Google Cloud Vision API.
 * 
 * Uses DOCUMENT_TEXT_DETECTION which provides the best OCR results,
 * including proper text ordering and structural analysis (pages,
 * blocks, paragraphs, words).
 * 
 * @param {Buffer} imageBuffer - PNG image buffer to process.
 * @param {string} apiKey - Google Cloud Vision API key.
 * @returns {Promise<Object>} Structured text extraction result:
 *   - fullText: Complete extracted text as a single string
 *   - blocks: Array of text blocks with paragraphs, lines, and words
 *   - confidence: Overall detection confidence (0-1)
 * @throws {Error} If the API call fails or returns an error.
 */
async function extractTextFromImage(imageBuffer, apiKey) {
  if (!apiKey) {
    throw new Error('Google Cloud Vision API key is not configured. Set GOOGLE_CLOUD_VISION_API_KEY in .env');
  }

  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Image buffer is empty or invalid.');
  }

  // Convert the image buffer to base64
  const base64Image = imageBuffer.toString('base64');

  // Build the Vision API request payload
  const requestPayload = {
    requests: [
      {
        image: {
          content: base64Image,
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION',
            maxResults: 1,
          },
        ],
        imageContext: {
          // Help Vision API with text detection settings
          languageHints: ['en'], // Primary language hint
        },
      },
    ],
  };

  try {
    console.log(`[VisionOCR] Sending image to Vision API (${(imageBuffer.length / 1024).toFixed(1)} KB)...`);

    const response = await axios.post(
      `${VISION_API_URL}?key=${apiKey}`,
      requestPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000, // 60 second timeout per image
        maxContentLength: 50 * 1024 * 1024, // 50MB max response
      }
    );

    // Check for API-level errors in the response
    const result = response.data.responses[0];

    if (result.error) {
      throw new Error(`Vision API error: ${result.error.message} (code: ${result.error.code})`);
    }

    // Parse the structured response
    return parseVisionResponse(result);
  } catch (err) {
    // Handle different types of errors
    if (err.response) {
      // HTTP error from the API
      const status = err.response.status;
      const message = err.response.data?.error?.message || err.message;

      if (status === 403) {
        throw new Error(`API key is invalid or Vision API is not enabled. Please check your API key and enable the Cloud Vision API in Google Cloud Console. Details: ${message}`);
      } else if (status === 429) {
        throw new Error(`Vision API rate limit exceeded. Please wait and try again. Details: ${message}`);
      } else if (status === 400) {
        throw new Error(`Invalid request to Vision API. The image may be too large or in an unsupported format. Details: ${message}`);
      } else {
        throw new Error(`Vision API HTTP ${status}: ${message}`);
      }
    } else if (err.code === 'ECONNABORTED') {
      throw new Error('Vision API request timed out. The image may be too large or the network may be slow.');
    } else if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to Google Cloud Vision API. Check your internet connection.');
    } else {
      throw err; // Re-throw if it's already a formatted error
    }
  }
}

/**
 * Parses the raw Vision API response into a structured format.
 * 
 * Extracts text at multiple levels of granularity:
 * - Full text annotation (complete text)
 * - Blocks (major text regions)
 * - Paragraphs (within blocks)
 * - Words (within paragraphs)
 * - Symbols (individual characters, used to reconstruct lines)
 * 
 * @param {Object} apiResponse - Raw response from Vision API.
 * @returns {Object} Structured text data.
 */
function parseVisionResponse(apiResponse) {
  // If no text was detected, return empty result
  if (!apiResponse.fullTextAnnotation && (!apiResponse.textAnnotations || apiResponse.textAnnotations.length === 0)) {
    console.log('[VisionOCR] No text detected in image.');
    return {
      fullText: '',
      blocks: [],
      lines: [],
      words: [],
      confidence: 0,
    };
  }

  const fullTextAnnotation = apiResponse.fullTextAnnotation;
  const fullText = fullTextAnnotation?.text || apiResponse.textAnnotations?.[0]?.description || '';

  // Parse detailed structure from fullTextAnnotation
  const blocks = [];
  const allLines = [];
  const allWords = [];
  let totalConfidence = 0;
  let confidenceCount = 0;

  if (fullTextAnnotation?.pages) {
    for (const page of fullTextAnnotation.pages) {
      for (const block of (page.blocks || [])) {
        const blockData = {
          type: block.blockType || 'TEXT',
          confidence: block.confidence || 0,
          boundingBox: formatBoundingBox(block.boundingBox),
          paragraphs: [],
        };

        for (const paragraph of (block.paragraphs || [])) {
          const paragraphData = {
            confidence: paragraph.confidence || 0,
            boundingBox: formatBoundingBox(paragraph.boundingBox),
            lines: [],
            words: [],
            text: '',
          };

          // Reconstruct words and lines from symbols
          let currentLine = [];
          let currentWord = '';
          const words = [];

          for (const word of (paragraph.words || [])) {
            let wordText = '';
            let hasLineBreak = false;

            for (const symbol of (word.symbols || [])) {
              wordText += symbol.text;

              // Check for line break after this symbol
              const detectedBreak = symbol.property?.detectedBreak;
              if (detectedBreak) {
                if (detectedBreak.type === 'EOL_SURE_SPACE' || 
                    detectedBreak.type === 'LINE_BREAK') {
                  hasLineBreak = true;
                }
              }
            }

            const wordData = {
              text: wordText,
              confidence: word.confidence || 0,
              boundingBox: formatBoundingBox(word.boundingBox),
            };

            words.push(wordData);
            allWords.push(wordData);
            currentLine.push(wordText);

            totalConfidence += word.confidence || 0;
            confidenceCount++;

            if (hasLineBreak && currentLine.length > 0) {
              const lineText = currentLine.join(' ');
              const lineData = { text: lineText };
              paragraphData.lines.push(lineData);
              allLines.push(lineData);
              currentLine = [];
            }
          }

          // Push any remaining words as the last line
          if (currentLine.length > 0) {
            const lineText = currentLine.join(' ');
            const lineData = { text: lineText };
            paragraphData.lines.push(lineData);
            allLines.push(lineData);
          }

          paragraphData.words = words;
          paragraphData.text = paragraphData.lines.map(l => l.text).join('\n');
          blockData.paragraphs.push(paragraphData);
        }

        blocks.push(blockData);
      }
    }
  }

  const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

  console.log(`[VisionOCR] Extracted ${allWords.length} words, ${allLines.length} lines, ${blocks.length} blocks (confidence: ${(averageConfidence * 100).toFixed(1)}%)`);

  return {
    fullText: fullText.trim(),
    blocks,
    lines: allLines,
    words: allWords,
    confidence: Math.round(averageConfidence * 1000) / 1000,
  };
}

/**
 * Formats a Vision API bounding box into a simpler structure.
 * 
 * @param {Object} boundingBox - Raw bounding box from Vision API.
 * @returns {Object|null} Formatted bounding box with vertices, or null.
 */
function formatBoundingBox(boundingBox) {
  if (!boundingBox?.vertices) return null;

  return {
    vertices: boundingBox.vertices.map(v => ({
      x: v.x || 0,
      y: v.y || 0,
    })),
  };
}

/**
 * Extracts text from multiple images (multi-page PDF support).
 * Processes pages sequentially to avoid rate limiting.
 * 
 * @param {Array<{pageNumber: number, imageBuffer: Buffer}>} pages - Array of page images.
 * @param {string} apiKey - Google Cloud Vision API key.
 * @returns {Promise<Object>} Combined extraction results with per-page data.
 */
async function extractTextFromPages(pages, apiKey) {
  const results = [];
  let combinedFullText = '';

  for (const page of pages) {
    console.log(`[VisionOCR] Processing page ${page.pageNumber}/${pages.length}...`);

    try {
      const pageResult = await extractTextFromImage(page.imageBuffer, apiKey);

      results.push({
        pageNumber: page.pageNumber,
        width: page.width,
        height: page.height,
        ...pageResult,
      });

      if (pageResult.fullText) {
        combinedFullText += (combinedFullText ? '\n\n--- Page ' + page.pageNumber + ' ---\n\n' : '') + pageResult.fullText;
      }
    } catch (err) {
      console.error(`[VisionOCR] Error processing page ${page.pageNumber}: ${err.message}`);
      results.push({
        pageNumber: page.pageNumber,
        error: err.message,
        fullText: '',
        blocks: [],
        lines: [],
        words: [],
        confidence: 0,
      });
    }
  }

  return {
    totalPages: pages.length,
    pages: results,
    combinedText: combinedFullText,
    successfulPages: results.filter(r => !r.error).length,
    failedPages: results.filter(r => r.error).length,
  };
}

module.exports = {
  extractTextFromImage,
  extractTextFromPages,
};
