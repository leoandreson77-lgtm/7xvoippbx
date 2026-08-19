const request = require('supertest');
const app = require('../src/server');
const { createTestAgent, createTestAdmin, cleanupTestData, disconnectDb } = require('./helpers/setup');

describe('Authentication', () => {
  let testAgent, testAdmin;

  beforeAll(async () => {
    await cleanupTestData();
    testAgent = await createTestAgent({
      extension: '9001',
      password: 'Agent@Test123',
      email: 'authtest@test.com',
      name: 'Auth Test Agent',
    });
    testAdmin = await createTestAdmin({
      extension: '9000',
      password: 'Admin@Test123',
      email: 'admintest@test.com',
      name: 'Auth Test Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectDb();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid extension and password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9001', password: 'Agent@Test123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.agent.name).toBe('Auth Test Agent');
      expect(res.body.extension.number).toBe('9001');
      // Should set cookie
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9001', password: 'WrongPassword123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    it('should reject non-existent extension', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9999', password: 'SomePassword123' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Invalid');
    });

    it('should reject invalid extension format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: 'abc', password: 'Agent@Test123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('extension');
    });

    it('should reject short password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9001', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Password');
    });

    it('should reject disabled extension', async () => {
      const disabled = await createTestAgent({
        extension: '9002',
        password: 'Agent@Test123',
        email: 'disabled-ext@test.com',
        extEnabled: false,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9002', password: 'Agent@Test123' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('disabled');
    });

    it('should reject disabled agent', async () => {
      const disabled = await createTestAgent({
        extension: '9003',
        password: 'Agent@Test123',
        email: 'disabled-agent@test.com',
        enabled: false,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9003', password: 'Agent@Test123' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('disabled');
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return agent info for authenticated request', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9001', password: 'Agent@Test123' });

      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.authenticated).toBe(true);
      expect(res.body.agent.extension).toBe('9001');
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/auth/session');

      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/session')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/sip-credentials', () => {
    it('should return SIP credentials for authenticated agent', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9001', password: 'Agent@Test123' });

      const token = loginRes.body.token;

      const res = await request(app)
        .get('/api/auth/sip-credentials')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.sipUri).toContain('9001');
      expect(res.body.ha1).toBeDefined();
      expect(res.body.ha1).toHaveLength(32); // MD5 hex
      expect(res.body.wsUrl).toBeDefined();
      expect(res.body.realm).toBeDefined();
      // Must NOT contain plaintext password
      expect(res.body.password).toBeUndefined();
      expect(res.body.sipPassword).toBeUndefined();
    });

    it('should reject unauthenticated request', async () => {
      const res = await request(app)
        .get('/api/auth/sip-credentials');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should logout and clear session', async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ extension: '9001', password: 'Agent@Test123' });

      const token = loginRes.body.token;

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
