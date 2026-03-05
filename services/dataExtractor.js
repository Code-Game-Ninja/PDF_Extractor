const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Parses OCR-extracted raw text into a structured JSON payload for Insurance/Customer details.
 * Uses Google Gemini 1.5 Flash with strict JSON output forcing.
 * 
 * @param {string} documentText - The combined extracted text from the PDF.
 * @returns {Promise<Object>} A parsed JSON object containing structured fields.
 */
async function extractStructuredData(documentText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[DataExtractor] GEMINI_API_KEY is not configured. Skipping structured extraction.');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Define the Gemini model configuration
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { 
      // Force valid JSON response
      responseMimeType: 'application/json' 
    }
  });

  const prompt = `
  You are an expert data extraction assistant for insurance policies and KYC documents.
  Extract the following fields from the provided document text perfectly accurately.
  If a field is genuinely missing or cannot be reasonably inferred, return null.
  Dates must be strictly formatted as YYYY-MM-DD.
  
  Expected JSON schema:
  {
    "policyDetails": {
      "policyNumber": "string or null",
      "policyType": "motor | health | life | fire | marine | liability | travel | engineering | null",
      "insurerName": "string or null",
      "premium": "number or null",
      "sumInsured": "number or null",
      "startDate": "YYYY-MM-DD or null",
      "endDate": "YYYY-MM-DD or null",
      "paymentFrequency": "annual | monthly | quarterly | half-yearly | null"
    },
    "customerDetails": {
      "customerName": "string or null",
      "customerPhone": "string or null",
      "customerEmail": "string or null",
      "customerAddress": "string or null",
      "customerCity": "string or null",
      "customerState": "string or null",
      "customerPincode": "string or null"
    }
  }

  DOCUMENT TEXT:
  """
  ${documentText}
  """
  `;

  try {
    console.log('[DataExtractor] Sending OCR text to Gemini for structured extraction...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();
    
    // Parse the JSON string
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[DataExtractor] Failed to extract structured data via Gemini:', error.message);
    throw new Error('LLM JSON Extraction failed: ' + error.message);
  }
}

module.exports = {
  extractStructuredData
};
