const http = require('http');

const postData = JSON.stringify({
  extension: 'admin@7xvoip.com',
  password: 'Admin@123'
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  console.log('Status code:', res.statusCode);
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response body:', body));
});

req.on('error', (e) => console.error('Error:', e.message));
req.write(postData);
req.end();
