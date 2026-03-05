const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Parses OCR-extracted raw text into a structured JSON payload for Insurance/Customer details.
 * Uses Google Gemini 1.5 Flash with strict JSON output forcing.
 * 
 * @param {string} documentText - The combined extracted text from the PDF.
 * @returns {Promise<Object>} A parsed JSON object containing structured fields.
 */
async function extractStructuredData(documentText) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[DataExtractor] GEMINI_API_KEY is not configured.');
      return { _error: 'GEMINI_API_KEY missing' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Configure model - Explicitly use v1beta for JSON response support
    const model = genAI.getGenerativeModel(
      { model: 'gemini-2.5-flash' },
      { apiVersion: 'v1beta' }
    );

    // Update generation config for JSON
    model.generationConfig = { responseMimeType: 'application/json' };

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

    console.log(`[DataExtractor] Sending ${documentText.length} chars to Gemini...`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();
    
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('[DataExtractor] Gemini Error:', error.message);
    return { 
      _error: error.message,
      _type: 'GEMINI_ERROR'
    };
  }
}

module.exports = {
  extractStructuredData
};
