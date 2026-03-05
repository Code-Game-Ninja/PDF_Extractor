# PDF Text Extractor

> Extract text from any PDF — including scanned documents — using Google Cloud Vision API OCR.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Express](https://img.shields.io/badge/Express-4.x-lightgrey) ![Vision API](https://img.shields.io/badge/Google_Cloud-Vision_API-blue)

---

## Features

- **Upload PDFs** — drag-and-drop or browse
- **Scanned PDF support** — converts pages to images for OCR
- **Multi-page handling** — processes all pages automatically
- **Structured output** — blocks, paragraphs, lines, words with bounding boxes
- **Reading order** — maintains text flow as detected by Vision API
- **Export** — download as `.txt` or `.json`
- **Copy to clipboard** — one-click copy
- **Error handling** — invalid files, large uploads, API failures

---

## Prerequisites

| Requirement | Version |
|---|---|
| **Node.js** | 18 or higher |
| **npm** | 9+ (comes with Node) |
| **Google Cloud Vision API key** | [Get one here](https://console.cloud.google.com/apis/credentials) |

### Enabling the Vision API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select existing)
3. Navigate to **APIs & Services → Library**
4. Search for **Cloud Vision API** and click **Enable**
5. Go to **APIs & Services → Credentials**
6. Click **Create Credentials → API Key**
7. Copy the API key

---

## Setup

### 1. Clone / Navigate to the project

```bash
cd pdf-text-extractor
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

Edit the `.env` file and set your API key:

```env
GOOGLE_CLOUD_VISION_API_KEY=your_api_key_here
PORT=3000
MAX_FILE_SIZE_MB=20
```

### 4. Start the server

```bash
npm start
```

Open **http://localhost:3000** in your browser.

For development with auto-restart:

```bash
npm run dev
```

---

## Project Structure

```
pdf-text-extractor/
├── server.js              # Express server entry point
├── routes/
│   └── upload.js          # Upload & processing API routes
├── services/
│   └── visionOCR.js       # Google Cloud Vision OCR service
├── utils/
│   └── pdfConverter.js    # PDF → image conversion (pdfjs-dist)
├── public/
│   └── index.html         # Frontend UI (TailwindCSS)
├── uploads/               # Temporary upload directory (auto-created)
├── .env                   # Environment variables (API key)
├── .gitignore
├── package.json
└── README.md
```

---

## API Reference

### `POST /api/upload`

Upload a PDF for text extraction.

**Request:**
```
Content-Type: multipart/form-data
Field: pdf (file)
```

**Example (cURL):**
```bash
curl -X POST http://localhost:3000/api/upload \
  -F "pdf=@/path/to/document.pdf"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "filename": "document.pdf",
    "fileSize": "245.3 KB",
    "totalPages": 2,
    "successfulPages": 2,
    "failedPages": 0,
    "combinedText": "Full extracted text from all pages...",
    "pages": [
      {
        "pageNumber": 1,
        "fullText": "Text from page 1...",
        "blocks": [
          {
            "type": "TEXT",
            "confidence": 0.98,
            "boundingBox": { "vertices": [{"x":0,"y":0}, ...] },
            "paragraphs": [
              {
                "confidence": 0.98,
                "text": "Paragraph text...",
                "lines": [{ "text": "Line text..." }],
                "words": [
                  {
                    "text": "Word",
                    "confidence": 0.99,
                    "boundingBox": { "vertices": [...] }
                  }
                ]
              }
            ]
          }
        ],
        "lines": [{ "text": "Line text..." }],
        "words": [{ "text": "Word", "confidence": 0.99 }],
        "confidence": 0.98
      }
    ],
    "processingTime": "3.45s"
  }
}
```

### `GET /api/health`

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "apiKeyConfigured": true,
  "maxFileSize": "20MB"
}
```

---

## NPM Packages Used

| Package | Purpose |
|---|---|
| `express` | Web server framework |
| `multer` | File upload handling |
| `axios` | HTTP client for Vision API calls |
| `pdf-parse` | Extracting embedded digital text (100% accuracy) |
| `pdfjs-dist` | PDF parsing and page rendering for OCR |
| `canvas` | Server-side canvas for PDF rendering |
| `sharp` | Image preprocessing (contrast, sharpening) for OCR |
| `dotenv` | Environment variable loading |
| `cors` | Cross-origin request handling |

---

## Deployment (Vercel)

This application is ready for serverless deployment on [Vercel](https://vercel.com/):

1. Commit your code and push to a GitHub repository.
2. Go to the Vercel Dashboard and click "Add New Project" > "Import from Git"
3. Select your repository.
4. Add the `GOOGLE_CLOUD_VISION_API_KEY` to the **Environment Variables** section.
5. Click **Deploy**.

> **Note:** The Multer upload configuration has been specifically adapted to use `os.tmpdir()` to work within Vercel's read-only serverless filesystem.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `canvas` fails to install | Install build tools: `npm install --global windows-build-tools` (Windows) or `brew install pkg-config cairo pango` (macOS) |
| API key error (403) | Ensure Cloud Vision API is enabled in your GCP project and billing is active |
| Blank Image / OCR fails | Only occurs on severely corrupted scans. The hybrid extractor handles empty fonts automatically. |
| Large PDFs timeout | Increase server timeout or reduce `MAX_FILE_SIZE_MB` |

---

## License

ISC
