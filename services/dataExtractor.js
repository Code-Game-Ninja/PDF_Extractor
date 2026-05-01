const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Fallback regex-based extraction when Gemini API is unavailable/quota exceeded.
 * Extracts common insurance fields using pattern matching.
 */
function extractWithRegex(text) {
  console.log('[DataExtractor] Using regex fallback extraction');
  
  const result = {
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
    },
    motorDetails: {
      regNumber: null, registrationType: null, financedBy: null,
      make: null, model: null, variant: null, fuelType: null,
      chassisNumber: null, engineNumber: null,
      seatingCapacity: null, tyreCount: null, mfgYear: null, cc: null,
      rcExpiry: null, fitnessExpiry: null, pucExpiry: null, permitExpiry: null,
      idvVehicle: null, idvCng: null, ncbPercent: null, netPremium: null,
      addons: { zeroDep: false, rti: false, rsa: false, engineProtector: false, 
                keyReplacement: false, consumables: false, paOwnerDriver: false, paidDriver: false }
    },
    lifeDetails: {
      planName: null, sumAssured: null, policyTerm: null, premiumPaymentTerm: null,
      paymentFrequency: null, riskStartDate: null, policyDate: null, nextDueDate: null,
      bankName: null, accNumber: null, ifscCode: null,
      nomineeName: null, nomineeRelation: null
    },
    healthDetails: { healthPolicyType: null, planName: null, sumInsured: null },
    commercialDetails: { riskDetails: null, occupancy: null, fireSi: null },
    _extractionMethod: 'regex_fallback'
  };

  // Policy Number patterns - based on training data
  const policyPatterns = [
    // Pattern: "D246453460 / 08012026Policy No." or "D246453460"
    /(?:policy\s*(?:number|no|#)[:\s]*)?([A-Z]\d{6,12})\s*(?:\/|\s)/i,
    // Pattern: "Policy No. D246453460" or "Policy Number: D246453460"
    /policy\s*(?:number|no|#)[:\s\.]+([A-Z0-9]{6,20})/i,
    // Pattern: standalone policy numbers with mixed format
    /\b([A-Z]\d{9,20})\b/i,
    // Pattern: numeric only policy numbers (10-20 digits)
    /(?:^|\s)(\d{10,20})(?:\s|$)/m
  ];
  for (const pattern of policyPatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length >= 6) { 
      result.policyDetails.policyNumber = match[1].trim(); 
      break; 
    }
  }

  // Customer Name patterns - based on training data (all caps names)
  const namePatterns = [
    // Pattern: "Name NAMAN KUMAR" or "Name: NAMAN KUMAR" (all caps)
    /name[:\s]+([A-Z]{3,20}(?:\s+[A-Z]{3,20}){0,2})/i,
    // Pattern: "Mr/Ms/Mrs NAME" (title case)
    /(?:mr|mrs|ms)\.?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    // Pattern: "Insured Name: XXX"
    /insured\s*(?:name)?[:\s]+([A-Z][a-zA-Z\s]{3,30})/i,
    // Pattern: "Customer Name: XXX"
    /customer\s*(?:name)?[:\s]+([A-Z][a-zA-Z\s]{3,30})/i
  ];
  for (const pattern of namePatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length > 2) { 
      result.customerDetails.customerName = match[1].trim(); 
      break; 
    }
  }

  // Phone patterns
  const phoneMatch = text.match(/(?:mobile|phone|contact)[:\s]*(\+?91?\s*[0-9]{10})/i) ||
                     text.match(/\b(\+?91\s*[0-9]{10})\b/) ||
                     text.match(/\b([0-9]{10})\b.*(?:phone|mobile|contact)/i);
  if (phoneMatch) result.customerDetails.customerPhone = phoneMatch[1].replace(/\s/g, '');

  // Email pattern
  const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) result.customerDetails.customerEmail = emailMatch[1];

  // Premium patterns
  const premiumMatch = text.match(/(?:total\s*)?premium[:\s]*(?:Rs\.?|INR|₹)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                       text.match(/(?:Rs\.?|INR|₹)\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:premium|total)/i);
  if (premiumMatch) result.policyDetails.premium = parseFloat(premiumMatch[1].replace(/,/g, ''));

  // Sum Insured patterns
  const siMatch = text.match(/(?:sum\s*insured|coverage|sa)[:\s]*(?:Rs\.?|INR|₹)?\s*([0-9,]+)/i) ||
                  text.match(/(?:Rs\.?|INR|₹)\s*([0-9,]+)\s*(?:sum\s*insured|coverage)/i);
  if (siMatch) result.policyDetails.sumInsured = parseFloat(siMatch[1].replace(/,/g, ''));

  // Vehicle Registration - format: UP78DL9585 (2 letters, 2 digits, 2 letters, 4 digits)
  const regPatterns = [
    /(?:vehicle\s*)?registration\s*(?:no|number)[:\s.]+([A-Z]{2}\d{2}[A-Z]{2}\d{4})/i,
    /\b([A-Z]{2}\d{2}[A-Z]{2}\d{4})\b/,
    /reg\.?\s*(?:no|number)[:\s.]+([A-Z]{2}\d{2}[A-Z]{1,2}\d{1,4})/i
  ];
  for (const pattern of regPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.motorDetails.regNumber = match[1];
      break;
    }
  }

  // Extract Motor-Specific Fields
  if (result.policyDetails.policyType === 'motor' || result.motorDetails.regNumber) {
    // Make (e.g., "Make HONDA")
    const makeMatch = text.match(/make[:\s.]+([A-Z][A-Z\s]+)(?:\n|$)/i) ||
                      text.match(/make[:\s.]+([A-Za-z]+)/i);
    if (makeMatch) result.motorDetails.make = makeMatch[1].trim();

    // Model/Variant (e.g., "Model ACTIVA/DLX" or "Model/Vehicle Type ACTIVA/DLX")
    const modelMatch = text.match(/model(?:\/(?:vehicle|sub-type))?[:\s.]+([A-Z0-9\/\-]+)/i) ||
                       text.match(/variant[:\s.]+([A-Z0-9\/\-]+)/i);
    if (modelMatch) result.motorDetails.model = modelMatch[1].trim();

    // Engine Number (e.g., "Engine No. E81086559")
    const engineMatch = text.match(/engine\s*(?:no|number)[:\s.]+([A-Z0-9]{5,20})/i);
    if (engineMatch) result.motorDetails.engineNumber = engineMatch[1].trim();

    // Chassis Number (e.g., "Chassis No. ME4JF502EE8087077")
    const chassisMatch = text.match(/chassis\s*(?:no|number)[:\s.]+([A-Z0-9]{10,25})/i);
    if (chassisMatch) result.motorDetails.chassisNumber = chassisMatch[1].trim();

    // Fuel Type (e.g., "Fuel Type Petrol")
    const fuelMatch = text.match(/fuel\s*(?:type)?[:\s.]+(petrol|diesel|cng|electric|ev)/i);
    if (fuelMatch) result.motorDetails.fuelType = fuelMatch[1].charAt(0).toUpperCase() + fuelMatch[1].slice(1).toLowerCase();

    // Year of Registration/Mfg (e.g., "Year of Regn 2014" or "Year of Mfg. 2014")
    const yearMatch = text.match(/year\s*of\s*(?:regn|registration|mfg)[:\s.]+(\d{4})/i);
    if (yearMatch) result.motorDetails.mfgYear = yearMatch[1];

    // Seating Capacity (e.g., "Seating Capacity 2")
    const seatingMatch = text.match(/seating\s*(?:capacity)?[:\s.]+(\d{1,2})/i);
    if (seatingMatch) result.motorDetails.seatingCapacity = parseInt(seatingMatch[1]);

    // Cubic Capacity/CC (e.g., "Cubic Capacity 110 CC")
    const ccMatch = text.match(/(?:cubic\s*capacity|cc)[:\s.]+(\d{2,4})/i);
    if (ccMatch) result.motorDetails.cc = ccMatch[1];

    // Financier/Hypothecation (e.g., "Financier Details CAPITAL FIRST")
    const financierMatch = text.match(/financier(?:\s*(?:details|name))?[:\s.]+([A-Z][A-Z\s]+)(?:\n|$)/i) ||
                           text.match(/financier[:\s.]+([A-Za-z\s]{3,30})/i);
    if (financierMatch) result.motorDetails.financedBy = financierMatch[1].trim();

    // Net Premium (from motor tables)
    const netPremiumMatch = text.match(/net\s*premium[:\s.]+(\d{1,6}(?:\.\d{2})?)/i);
    if (netPremiumMatch) result.motorDetails.netPremium = parseFloat(netPremiumMatch[1]);
  }

  // Detect Policy Type from keywords and extracted data
  const textLower = text.toLowerCase();
  
  // === LIFE INSURANCE FIELDS ===
  if (result.policyDetails.policyType === 'life' || textLower.includes('life')) {
    // Plan Name (e.g., "Plan Name: Jeevan Anand", "Product: Endowment Plan")
    const planMatch = text.match(/(?:plan\s*name|product)[:\s]+([A-Za-z\s\-]+)(?:\n|$)/i) ||
                      text.match(/(?:plan|product)[:\s]+([A-Z][A-Z\s\-]+)(?:\n|$)/i);
    if (planMatch) result.lifeDetails.planName = planMatch[1].trim();

    // Policy Term (e.g., "Policy Term: 20 Years", "Term: 15")
    const termMatch = text.match(/policy\s*term[:\s]+(\d{1,3})/i) ||
                      text.match(/term[:\s]+(\d{1,3})\s*(?:years?|yrs?)/i);
    if (termMatch) result.lifeDetails.policyTerm = parseInt(termMatch[1]);

    // Premium Payment Term (e.g., "Premium Paying Term: 10 Years")
    const pptMatch = text.match(/(?:premium\s*paying?|payment)\s*term[:\s]+(\d{1,3})/i);
    if (pptMatch) result.lifeDetails.premiumPaymentTerm = parseInt(pptMatch[1]);

    // Payment Frequency (e.g., "Mode: Yearly", "Frequency: Monthly")
    const freqMatch = text.match(/(?:mode|frequency|payment\s*mode)[:\s]+(yearly|monthly|quarterly|half-yearly|single)/i);
    if (freqMatch) result.lifeDetails.paymentFrequency = freqMatch[1].toLowerCase();

    // Nominee Name (e.g., "Nominee: Ramesh Kumar", "Nominee Name: Sunita")
    const nomineeMatch = text.match(/nominee(?:\s*name)?[:\s]+([A-Z][a-zA-Z\s\.]+)(?:\n|$)/i);
    if (nomineeMatch) result.lifeDetails.nomineeName = nomineeMatch[1].trim();

    // Nominee Relation (e.g., "Relation: Wife", "Relationship: Son")
    const relationMatch = text.match(/(?:relation|relationship)[:\s]+(wife|husband|son|daughter|mother|father|brother|sister|spouse)/i);
    if (relationMatch) result.lifeDetails.nomineeRelation = relationMatch[1].charAt(0).toUpperCase() + relationMatch[1].slice(1);

    // Bank Details for ECS
    const bankMatch = text.match(/bank\s*(?:name)?[:\s]+([A-Z][a-zA-Z\s]+)(?:\n|$)/i);
    if (bankMatch) result.lifeDetails.bankName = bankMatch[1].trim();

    const accMatch = text.match(/(?:account|a\/c|ac\s*no)[:\s]+(\d{9,18})/i);
    if (accMatch) result.lifeDetails.accNumber = accMatch[1];

    const ifscMatch = text.match(/ifsc[:\s]+([A-Z]{4}0[A-Z0-9]{6})/i);
    if (ifscMatch) result.lifeDetails.ifscCode = ifscMatch[1];
  }

  // === HEALTH INSURANCE FIELDS ===
  if (result.policyDetails.policyType === 'health' || textLower.includes('health')) {
    // Health Policy Type (e.g., "Policy Type: Family Floater", "Individual")
    const healthTypeMatch = text.match(/(?:policy\s*)?type[:\s]+(individual|floater|family)/i);
    if (healthTypeMatch) result.healthDetails.healthPolicyType = healthTypeMatch[1].charAt(0).toUpperCase() + healthTypeMatch[1].slice(1);

    // Health Plan Name
    const healthPlanMatch = text.match(/(?:plan|scheme)[:\s]+([A-Z][A-Za-z\s\-]+)(?:\n|$)/i);
    if (healthPlanMatch) result.healthDetails.planName = healthPlanMatch[1].trim();
  }

  // === COMMERCIAL INSURANCE FIELDS ===
  if (result.policyDetails.policyType === 'commercial' || textLower.includes('fire') || textLower.includes('marine')) {
    // Risk Details / Description
    const riskMatch = text.match(/(?:risk|description|subject|matter\s*of\s*insurance)[:\s]+([A-Z].{10,200})(?:\n|$)/im);
    if (riskMatch) result.commercialDetails.riskDetails = riskMatch[1].trim().substring(0, 200);

    // Occupancy / Business Type
    const occupancyMatch = text.match(/(?:occupancy|business|trade)[:\s]+([A-Z][A-Za-z\s\-]+)(?:\n|$)/i);
    if (occupancyMatch) result.commercialDetails.occupancy = occupancyMatch[1].trim();

    // Fire SI (Sum Insured for Fire policies)
    const fireSiMatch = text.match(/(?:fire\s*si|sum\s*insured\s*fire)[:\s\.]+(\d{1,10}(?:,\d{3})*)/i);
    if (fireSiMatch) result.commercialDetails.fireSi = parseFloat(fireSiMatch[1].replace(/,/g, ''));
  }

  // Check for motor vehicle indicators
  if (result.motorDetails.regNumber || 
      result.motorDetails.chassisNumber ||
      textLower.includes('vehicle registration') ||
      textLower.includes('chassis no') ||
      textLower.includes('engine no') ||
      textLower.includes('two-wheeler') ||
      textLower.includes('four-wheeler') ||
      textLower.includes('make') && textLower.includes('model') ||
      /\b(activa|honda|maruti|tata|hyundai|bajaj|hero|tvs|yamaha|suzuki|kawasaki|bmw|audi|mercedes)\b/i.test(text)) {
    result.policyDetails.policyType = 'motor';
  } else if (textLower.includes('health') || textLower.includes('medical') || textLower.includes('medicare') || textLower.includes('hospital')) {
    result.policyDetails.policyType = 'health';
  } else if (textLower.includes('life') || textLower.includes('term plan') || textLower.includes('endowment') || textLower.includes('ulip')) {
    result.policyDetails.policyType = 'life';
  } else if (textLower.includes('fire') || textLower.includes('marine') || textLower.includes('burglary') || textLower.includes('engineering')) {
    result.policyDetails.policyType = 'commercial';
  } else if (textLower.includes('personal accident') || textLower.includes('pa cover')) {
    result.policyDetails.policyType = 'motor'; // PA is usually motor add-on
  }

  // Insurer detection
  const insurers = ['Reliance', 'Bajaj Allianz', 'ICICI Lombard', 'HDFC ERGO', 'TATA AIG', 
                   'New India', 'United India', 'Oriental', 'National', 'Bharti AXA',
                   'Kotak', 'SBI General', 'Liberty', 'Royal Sundaram', 'Go Digit'];
  const textUpper = text.toUpperCase();
  for (const insurer of insurers) {
    if (text.includes(insurer) || textUpper.includes(insurer.toUpperCase()) || 
        (insurer === 'Go Digit' && textUpper.includes('DIGIT'))) {
      result.policyDetails.insurerName = insurer;
      break;
    }
  }

  console.log('[DataExtractor] Regex fallback extracted:');
  console.log('  Policy:', {
    number: result.policyDetails.policyNumber,
    type: result.policyDetails.policyType,
    insurer: result.policyDetails.insurerName,
    premium: result.policyDetails.premium,
    sumInsured: result.policyDetails.sumInsured
  });
  console.log('  Customer:', {
    name: result.customerDetails.customerName,
    phone: result.customerDetails.customerPhone,
    email: result.customerDetails.customerEmail
  });
  console.log('  Motor:', {
    regNumber: result.motorDetails.regNumber,
    make: result.motorDetails.make,
    model: result.motorDetails.model,
    engineNumber: result.motorDetails.engineNumber,
    chassisNumber: result.motorDetails.chassisNumber,
    fuelType: result.motorDetails.fuelType,
    year: result.motorDetails.mfgYear,
    seating: result.motorDetails.seatingCapacity,
    cc: result.motorDetails.cc,
    financier: result.motorDetails.financedBy
  });
  console.log('  Life:', {
    planName: result.lifeDetails.planName,
    policyTerm: result.lifeDetails.policyTerm,
    ppt: result.lifeDetails.premiumPaymentTerm,
    frequency: result.lifeDetails.paymentFrequency,
    nomineeName: result.lifeDetails.nomineeName,
    nomineeRelation: result.lifeDetails.nomineeRelation,
    bank: result.lifeDetails.bankName
  });
  console.log('  Health:', {
    policyType: result.healthDetails.healthPolicyType,
    planName: result.healthDetails.planName,
    sumInsured: result.healthDetails.sumInsured
  });
  console.log('  Commercial:', {
    riskDetails: result.commercialDetails.riskDetails,
    occupancy: result.commercialDetails.occupancy,
    fireSi: result.commercialDetails.fireSi
  });

  return result;
}

/**
 * Parses OCR-extracted raw text into a structured JSON payload for Insurance/Customer details.
 * Uses Google Gemini 1.5 Flash with strict JSON output forcing.
 * Falls back to regex extraction if Gemini quota exceeded.
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
      model: 'gemini-1.5-flash',
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
    Numbers should be extracted as numeric values (not strings).
    
    Expected JSON schema:
    {
      "policyDetails": {
        "policyNumber": "string or null",
        "policyType": "motor | health | life | fire | marine | liability | travel | engineering | null",
        "insurerName": "string or null",
        "premium": "number or null - total premium amount",
        "sumInsured": "number or null - total sum insured / coverage amount",
        "startDate": "YYYY-MM-DD or null - policy start date",
        "endDate": "YYYY-MM-DD or null - policy end/expiry date",
        "paymentFrequency": "annual | monthly | quarterly | half-yearly | null"
      },
      "customerDetails": {
        "customerName": "string or null - full name of insured",
        "customerPhone": "string or null - mobile number",
        "customerEmail": "string or null - email address",
        "customerAddress": "string or null - full address",
        "customerCity": "string or null - city",
        "customerState": "string or null - state",
        "customerPincode": "string or null - pincode/zip"
      },
      "motorDetails": {
        "regNumber": "string or null - vehicle registration number (e.g., MH-01-AB-1234)",
        "registrationType": "string or null - Private / Commercial",
        "financedBy": "string or null - bank/financier name if hypothecated",
        "make": "string or null - vehicle manufacturer (e.g., Maruti, Honda)",
        "model": "string or null - vehicle model name",
        "variant": "string or null - vehicle variant",
        "fuelType": "string or null - Petrol / Diesel / CNG / Electric",
        "chassisNumber": "string or null - chassis/VIN number",
        "engineNumber": "string or null - engine number",
        "seatingCapacity": "number or null - including driver",
        "tyreCount": "number or null - number of tyres",
        "mfgYear": "number or null - year of manufacture/registration",
        "cc": "string or null - cubic capacity (e.g., 110 CC)",
        "rcExpiry": "YYYY-MM-DD or null - RC expiry date",
        "fitnessExpiry": "YYYY-MM-DD or null - fitness certificate expiry",
        "pucExpiry": "YYYY-MM-DD or null - PUC expiry date",
        "permitExpiry": "YYYY-MM-DD or null - permit expiry for commercial",
        "idvVehicle": "number or null - Insured Declared Value of vehicle",
        "idvCng": "number or null - IDV of CNG kit if fitted",
        "ncbPercent": "number or null - No Claim Bonus percentage",
        "netPremium": "number or null - net premium after discounts",
        "addons": {
          "zeroDep": "boolean - Zero Depreciation cover",
          "rti": "boolean - Return to Invoice cover",
          "rsa": "boolean - Road Side Assistance",
          "engineProtector": "boolean - Engine Protector add-on",
          "keyReplacement": "boolean - Key Replacement cover",
          "consumables": "boolean - Consumables cover",
          "paOwnerDriver": "boolean - PA cover for owner-driver",
          "paidDriver": "boolean - Paid driver cover"
        }
      },
      "lifeDetails": {
        "planName": "string or null - insurance plan/product name",
        "sumAssured": "number or null - life cover amount",
        "policyTerm": "number or null - policy duration in years",
        "premiumPaymentTerm": "number or null - years to pay premium",
        "paymentFrequency": "annual | monthly | quarterly | half-yearly | null",
        "riskStartDate": "YYYY-MM-DD or null - risk commencement date",
        "policyDate": "YYYY-MM-DD or null - policy issuance date",
        "nextDueDate": "YYYY-MM-DD or null - next premium due date",
        "bankName": "string or null - bank name for ECS",
        "accNumber": "string or null - bank account number",
        "ifscCode": "string or null - IFSC code",
        "nomineeName": "string or null - nominee full name",
        "nomineeRelation": "string or null - relationship with insured"
      },
      "healthDetails": {
        "healthPolicyType": "string or null - Individual / Floater / Family",
        "planName": "string or null - health plan name",
        "sumInsured": "number or null - total coverage amount"
      },
      "commercialDetails": {
        "riskDetails": "string or null - detailed risk description",
        "occupancy": "string or null - type of occupancy/business",
        "fireSi": "number or null - fire and terrorism sum insured"
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
    
    // All retries failed - use regex fallback
    console.warn('[DataExtractor] All Gemini retries failed, using regex fallback');
    const fallbackResult = extractWithRegex(documentText);
    fallbackResult._error = lastError?.message || 'Gemini failed after retries';
    fallbackResult._type = 'FALLBACK_REGEX';
    return fallbackResult;
  } catch (error) {
    console.error('[DataExtractor] Gemini Error after all retries:', error.message);
    // Check if it's a quota error - use regex fallback
    if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('exceeded')) {
      console.log('[DataExtractor] Quota exceeded detected, using regex fallback...');
      return extractWithRegex(documentText);
    }
    // For other errors, still try regex fallback
    console.log('[DataExtractor] Using regex fallback due to error...');
    const fallbackResult = extractWithRegex(documentText);
    fallbackResult._error = error.message;
    fallbackResult._type = 'FALLBACK_REGEX';
    return fallbackResult;
  }
}

module.exports = {
  extractStructuredData,
  extractWithRegex
};
