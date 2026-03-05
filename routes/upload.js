/**
 * ============================================
 * Upload Routes
 * ============================================
 * 
 * Handles PDF file upload, conversion to images,
 * OCR processing via Vision API, and returning
 * structured text extraction results.
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractFromPdf } = require('../utils/textExtractor');
const { extractStructuredData } = require('../services/dataExtractor');

const router = express.Router();

const os = require('os');

// ============================================
// Multer Configuration for PDF Uploads
// ============================================

// Maximum file size from environment (default: 20MB)
const MAX_FILE_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB) || 20) * 1024 * 1024;

// Configure multer storage for Serverless environments (like Vercel)
// Vercel only allows writing to the /tmp directory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(os.tmpdir(), 'pdf-uploads');
    // Ensure uploads directory exists in /tmp
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `pdf-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// File filter: only accept PDF files
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['application/pdf'];
  const allowedExts = ['.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF files are accepted.`), false);
  }
};

// Create multer upload middleware
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1, // Only one file at a time
  },
});

// ============================================
// Routes
// ============================================

/**
 * POST /api/upload
 * 
 * Accepts a PDF file upload and extracts text using hybrid approach:
 * - Digital text layer extraction (pdf-parse) for PDFs with embedded text
 * - Vision API OCR for scanned/image-based pages
 * - Sharp image preprocessing for better OCR accuracy
 * 
 * Request: multipart/form-data with field name "pdf"
 */
router.post('/upload', (req, res, next) => {
  // Handle multer upload with error catching
  upload.single('pdf')(req, res, async (err) => {
    // Track processing start time
    const startTime = Date.now();
    let uploadedFilePath = null;

    try {
      // ---- Handle Multer Errors ----
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: `File is too large. Maximum size is ${process.env.MAX_FILE_SIZE_MB || 20}MB.`,
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            error: 'Only one file can be uploaded at a time.',
          });
        }
        return res.status(400).json({
          success: false,
          error: `Upload error: ${err.message}`,
        });
      }

      if (err) {
        return res.status(400).json({
          success: false,
          error: err.message,
        });
      }

      // ---- Validate File ----
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded. Please select a PDF file.',
        });
      }

      uploadedFilePath = req.file.path;
      const originalName = req.file.originalname;
      const fileSize = req.file.size;

      console.log(`\n[Upload] Received: "${originalName}" (${(fileSize / 1024).toFixed(1)} KB)`);

      // ---- Check API Key ----
      const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'Server configuration error: Vision API key is not set.',
        });
      }

      // ---- Hybrid Extraction ----
      // Automatically uses digital text (pdf-parse) where available,
      // falls back to Vision API OCR for scanned/image pages
      console.log('[Upload] Starting hybrid extraction...');
      const extractionResults = await extractFromPdf(uploadedFilePath, apiKey, { scale: 2.5 });

      // ---- Calculate Processing Time ----
      const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[Upload] Processing complete in ${processingTime}s`);
      console.log(`[Upload] Digital: ${extractionResults.digitalPages} pages | OCR: ${extractionResults.ocrPages} pages`);

      // ---- Process Extract with LLM (Structured Data) ----
      let structuredData = null;
      if (extractionResults.combinedText && extractionResults.combinedText.length > 50) {
        try {
          console.log(`[Upload] Sending ${extractionResults.combinedText.length} chars to Gemini for structured extraction...`);
          structuredData = await extractStructuredData(extractionResults.combinedText);
          console.log('[Upload] Gemini extraction result:', structuredData ? 'Object received' : 'NULL received');
        } catch (llmErr) {
          console.error('[Upload] LLM Extraction failed:', llmErr.message);
        }
      } else {
        console.warn('[Upload] Not enough text for Gemini extraction. Length:', extractionResults.combinedText?.length || 0);
      }

      // ---- Send Response ----
      return res.status(200).json({
        success: true,
        data: {
          filename: originalName,
          fileSize: `${(fileSize / 1024).toFixed(1)} KB`,
          totalPages: extractionResults.totalPages,
          successfulPages: extractionResults.successfulPages,
          failedPages: extractionResults.failedPages,
          digitalPages: extractionResults.digitalPages,
          ocrPages: extractionResults.ocrPages,
          structuredData: structuredData,
          combinedText: extractionResults.combinedText,
          pages: extractionResults.pages,
          processingTime: `${processingTime}s`,
        },
      });
    } catch (err) {
      console.error('[Upload] Unexpected error:', err);
      return res.status(500).json({
        success: false,
        error: `An unexpected error occurred: ${err.message}`,
      });
    } finally {
      // ---- Clean Up Uploaded File ----
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        try {
          fs.unlinkSync(uploadedFilePath);
          console.log('[Upload] Cleaned up temporary file.');
        } catch (cleanupErr) {
          console.error('[Upload] Failed to clean up file:', cleanupErr.message);
        }
      }
    }
  });
});

/**
 * GET /api/health
 * 
 * Health check endpoint to verify the server is running
 * and the API key is configured.
 */
router.get('/health', (req, res) => {
  const visionApiKeyConfigured = !!process.env.GOOGLE_CLOUD_VISION_API_KEY;
  const geminiApiKeyConfigured = !!process.env.GEMINI_API_KEY;

  res.json({
    status: 'ok',
    version: '1.0.2',
    timestamp: new Date().toISOString(),
    visionApiKeyConfigured,
    geminiApiKeyConfigured,
    maxFileSize: `${process.env.MAX_FILE_SIZE_MB || 20}MB`,
  });
});

module.exports = router;
