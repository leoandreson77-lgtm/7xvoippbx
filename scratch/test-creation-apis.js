const http = require('http');

const loginData = JSON.stringify({ extension: 'admin@7xvoip.com', password: 'Admin@123' });

function post(url, data, token) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(`http://localhost:3000${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(body || '{}') }));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('Testing Admin Creation Endpoints...\n');
  const loginRes = await post('/api/auth/login', { extension: 'admin@7xvoip.com', password: 'Admin@123' });
  const token = loginRes.data.token;
  console.log('1. Admin Login:', loginRes.status === 200 ? '✅ SUCCESS' : '❌ FAILED');

  // Test 1: Create Extension 1005
  const extRes = await post('/api/admin/extensions', { number: '1005', sipPassword: 'Ext1005Pass@' }, token);
  console.log('2. Create Extension (1005):', extRes.status === 201 ? '✅ SUCCESS' : `❌ Status ${extRes.status}`, extRes.data);

  // Test 2: Create Agent
  const agentRes = await post('/api/admin/agents', { name: 'Test Agent Vikrant', email: `vikrant_${Date.now()}@7xvoip.com`, password: 'AgentPassword123', role: 'agent' }, token);
  console.log('3. Create Agent:', agentRes.status === 201 ? '✅ SUCCESS' : `❌ Status ${agentRes.status}`, agentRes.data);

  // Test 3: Create TFN Number
  const tfnRes = await post('/api/admin/tfns', { number: `+1800555${Math.floor(1000 + Math.random() * 9000)}`, label: 'Test Campaign TFN' }, token);
  console.log('4. Create TFN Number:', tfnRes.status === 201 ? '✅ SUCCESS' : `❌ Status ${tfnRes.status}`, tfnRes.data);

  // Test 4: Create SIP Trunk
  const trunkRes = await post('/api/admin/trunks', { name: 'Test Telnyx Trunk', provider: 'telnyx', host: 'sip.telnyx.com', port: 5060, username: 'testuser', password: 'testpass' }, token);
  console.log('5. Create SIP Trunk:', trunkRes.status === 201 ? '✅ SUCCESS' : `❌ Status ${trunkRes.status}`, trunkRes.data);
}

run().catch(console.error);
