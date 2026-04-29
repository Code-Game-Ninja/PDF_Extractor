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
    
    // Configure model with correct model name and JSON response
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash-latest',
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1, // Low temperature for more accurate extraction
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

    console.log(`[DataExtractor] Sending ${documentText.length} chars to Gemini...`);
    
    // Retry logic for transient failures
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        // Get text and parse JSON
        let jsonText = response.text();
        
        // Sometimes Gemini wraps JSON in markdown code blocks, clean it
        if (jsonText.includes('```json')) {
          jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.includes('```')) {
          jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        const parsed = JSON.parse(jsonText);
        console.log('[DataExtractor] Successfully extracted structured data');
        return parsed;
      } catch (err) {
        lastError = err;
        console.warn(`[DataExtractor] Attempt ${attempt} failed: ${err.message}`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential backoff
        }
      }
    }
    
    throw lastError;
  } catch (error) {
    console.error('[DataExtractor] Gemini Error after all retries:', error.message);
    return { 
      _error: error.message,
      _type: 'GEMINI_ERROR',
      policyDetails: {
        policyNumber: null,
        policyType: null,
        insurerName: null,
        premium: null,
        sumInsured: null,
        startDate: null,
        endDate: null,
        paymentFrequency: null
      },
      customerDetails: {
        customerName: null,
        customerPhone: null,
        customerEmail: null,
        customerAddress: null,
        customerCity: null,
        customerState: null,
        customerPincode: null
      }
    };
  }
}

module.exports = {
  extractStructuredData
};
