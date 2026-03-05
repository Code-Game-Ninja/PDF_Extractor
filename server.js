/**
 * ============================================
 * PDF Text Extractor - Server Entry Point
 * ============================================
 * 
 * Express.js server that provides a REST API for
 * extracting text from PDF files using Google Cloud
 * Vision API OCR.
 * 
 * Features:
 *  - PDF file upload via multipart form
 *  - PDF → Image conversion (pdfjs-dist + node-canvas)
 *  - OCR text extraction (Google Cloud Vision API)
 *  - Structured JSON response with pages, blocks, lines, words
 *  - Static file serving for the web UI
 *  - Health check endpoint
 * 
 * Usage:
 *  $ npm install
 *  $ npm start
 *  Open http://localhost:3000 in your browser
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import routes
const uploadRoutes = require('./routes/upload');

// ============================================
// App Configuration
// ============================================

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// Middleware
// ============================================

// Enable CORS for all origins (adjust in production)
app.use(cors());

// Parse JSON request bodies (for potential future API use)
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// Ensure Required Directories Exist
// ============================================

// (Directory creation handled by multer storage in routes/upload.js as needed)

// ============================================
// Routes
// ============================================

// API routes
app.use('/api', uploadRoutes);

// Serve the frontend for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================
// Global Error Handler
// ============================================

app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);

  // Handle payload too large
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: 'Request payload is too large.',
    });
  }

  // Handle JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body.',
    });
  }

  // Generic server error
  res.status(500).json({
    success: false,
    error: 'An internal server error occurred.',
  });
});

// Handle 404 for undefined API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log('\n========================================');
  console.log('  PDF Text Extractor Server');
  console.log('========================================');
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log(`  API Key:  ${process.env.GOOGLE_CLOUD_VISION_API_KEY ? '✓ Configured' : '✗ NOT SET'}`);
  console.log(`  Max Size: ${process.env.MAX_FILE_SIZE_MB || 20}MB`);
  console.log('========================================\n');
});

module.exports = app;
