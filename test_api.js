const fs = require('fs');
const path = require('path');

async function testUpload() {
  const pdfPath = path.join(__dirname, 'pdf', 'INSURANCE 4329.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error('Test PDF not found at', pdfPath);
    return;
  }

  // Create native FormData object
  const formData = new FormData();
  
  // Read file as Blob
  const fileBuffer = fs.readFileSync(pdfPath);
  const blob = new Blob([fileBuffer], { type: 'application/pdf' });
  formData.append('pdf', blob, 'INSURANCE 4329.pdf');

  console.log('Sending PDF to production server...');
  try {
    const response = await fetch('https://pdf-text-extractor-alpha.vercel.app/api/upload', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('API Error Response:', result);
      return;
    }

    console.log('\n--- SUCCESS ---');
    console.log('Total Pages:', result.data.totalPages);
    console.log('Combined Text Length:', result.data.combinedText?.length || 0);
    console.log('Combined Text Sample:', result.data.combinedText?.substring(0, 500));
    
    console.log('\n--- STRUCTURED DATA (GEMINI) ---');
    console.log(JSON.stringify(result.data.structuredData, null, 2));

  } catch (error) {
    console.error('Network or Parse Error:', error);
  }
}

testUpload();
