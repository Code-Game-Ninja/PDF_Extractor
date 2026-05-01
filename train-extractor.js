const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Simple text extraction using pdf-parse (same library used in production)
async function extractTextFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// PDF files to analyze
const pdfFiles = [
  '202610000475210_Policy_118212052.pdf',
  'Bitha Airport_CAR.pdf',
  'Bombay Trasport company (Fire).pdf',
  'INSURANCE 4329.pdf',
  'OG-26-1302-1801-00002652 (1).pdf',
  'Policy -UP78GS1006.pdf',
  'UP32MN1102......pdf',
  'godigit.pdf'
];

async function analyzePDFs() {
  const results = [];
  
  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(__dirname, 'pdf', pdfFile);
    
    if (!fs.existsSync(pdfPath)) {
      console.log(`Skipping ${pdfFile} - file not found`);
      continue;
    }
    
    console.log(`\n========== ${pdfFile} ==========`);
    
    try {
      // Extract text using pdf-parse
      const text = await extractTextFromPDF(pdfPath);
      
      console.log(`Text length: ${text.length} chars`);
      console.log('\n--- FIRST 2000 CHARACTERS ---');
      console.log(text.substring(0, 2000));
      console.log('\n--- END OF SAMPLE ---\n');
      
      // Analyze for key patterns
      const analysis = {
        filename: pdfFile,
        textLength: text.length,
        hasPolicyNumber: /policy\s*(?:number|no|#)[:\s]*([A-Z0-9\-]+)/i.test(text),
        hasVehicleReg: /[A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{1,4}/.test(text),
        hasPhone: /\b[0-9]{10}\b/.test(text),
        hasEmail: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text),
        hasPremium: /(?:Rs\.?|INR|₹)\s*[0-9,]+/.test(text),
        hasSumInsured: /sum\s*insured|coverage|IDV/i.test(text),
        insurerMentions: [],
        possibleNames: [],
        possiblePolicyNumbers: []
      };
      
      // Detect insurer
      const insurers = ['ICICI Lombard', 'Bajaj Allianz', 'Reliance', 'HDFC ERGO', 'TATA AIG', 
                       'New India', 'United India', 'Oriental', 'National', 'Go Digit',
                       'Kotak', 'SBI General', 'Liberty', 'Royal Sundaram'];
      for (const insurer of insurers) {
        if (text.includes(insurer) || text.toUpperCase().includes(insurer.toUpperCase())) {
          analysis.insurerMentions.push(insurer);
        }
      }
      
      // Find potential names (Mr/Ms/Mrs patterns)
      const nameMatches = text.match(/(?:Mr|Mrs|Ms)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/g);
      if (nameMatches) {
        analysis.possibleNames = nameMatches.slice(0, 5);
      }
      
      // Find potential policy numbers (long digit sequences)
      const policyMatches = text.match(/\b\d{10,20}\b/g);
      if (policyMatches) {
        analysis.possiblePolicyNumbers = policyMatches.slice(0, 5);
      }
      
      console.log('Analysis:', JSON.stringify(analysis, null, 2));
      results.push(analysis);
      
    } catch (err) {
      console.error(`Error processing ${pdfFile}:`, err.message);
    }
  }
  
  // Save training report
  fs.writeFileSync(
    path.join(__dirname, 'training-report.json'), 
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n\n========== TRAINING COMPLETE ==========');
  console.log(`Analyzed ${results.length} PDFs`);
  console.log('Report saved to: training-report.json');
  
  // Print summary
  console.log('\n--- SUMMARY ---');
  results.forEach(r => {
    console.log(`\n${r.filename}:`);
    console.log(`  Insurer: ${r.insurerMentions.join(', ') || 'Unknown'}`);
    console.log(`  Policy Numbers found: ${r.possiblePolicyNumbers.join(', ') || 'None'}`);
    console.log(`  Names found: ${r.possibleNames.join(', ') || 'None'}`);
  });
}

analyzePDFs().catch(console.error);
