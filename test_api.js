const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

async function testUpload() {
  const pdfPath = path.join(__dirname, 'pdf', 'INSURANCE 4329.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    console.error('Test PDF not found at', pdfPath);
    return;
  }

  const form = new FormData();
  form.append('pdf', fs.createReadStream(pdfPath));

  console.log('Sending PDF to local server...');
  try {
    const response = await axios.post('http://localhost:3000/api/upload', form, {
      headers: { ...form.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.log('\n--- SUCCESS ---');
    console.log('Total Pages:', response.data.data.totalPages);
    console.log('\n--- STRUCTURED DATA (GEMINI) ---');
    console.log(JSON.stringify(response.data.data.structuredData, null, 2));

  } catch (error) {
    console.error('Error during upload:', error.response?.data || error.message);
  }
}

testUpload();
