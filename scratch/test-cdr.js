const http = require('http');

const loginData = JSON.stringify({ extension: 'admin@7xvoip.com', password: 'Admin@123' });

const req = http.request('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const loginRes = JSON.parse(body);
    const token = loginRes.token;
    console.log('Login Status:', res.statusCode);
    console.log('Token acquired:', token ? 'YES' : 'NO');

    http.get('http://localhost:3000/api/admin/cdr', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, (cdrRes) => {
      let cdrBody = '';
      cdrRes.on('data', chunk => cdrBody += chunk);
      cdrRes.on('end', () => {
        const cdrData = JSON.parse(cdrBody);
        console.log('CDR Status:', cdrRes.statusCode);
        console.log('CDR Logs count:', cdrData.logs ? cdrData.logs.length : 0);
        console.log('First CDR Record:', cdrData.logs ? cdrData.logs[0] : null);
      });
    });
  });
});

req.write(loginData);
req.end();
