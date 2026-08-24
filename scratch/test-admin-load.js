const http = require('http');

http.get('http://localhost:3000/admin', (res) => {
  console.log('Status code:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('HTML size:', data.length);
    console.log('Contains admin-layout:', data.includes('admin-layout'));
  });
}).on('error', (err) => {
  console.error('Error fetching /admin:', err.message);
});
