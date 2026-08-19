const request = require('supertest');
const app = require('../src/server');
const { createTestAdmin, createTestAgent, cleanupTestData, disconnectDb } = require('./helpers/setup');

describe('Extension Management', () => {
  let adminToken;

  beforeAll(async () => {
    await cleanupTestData();
    const admin = await createTestAdmin({
      extension: '8000',
      password: 'Admin@Test123',
      email: 'ext-admin@test.com',
      name: 'Ext Admin',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ extension: '8000', password: 'Admin@Test123' });

    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectDb();
  });

  describe('POST /api/admin/extensions', () => {
    it('should create a new extension', async () => {
      const res = await request(app)
        .post('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ number: '8001', sipPassword: 'SipPass@123' });

      expect(res.status).toBe(201);
      expect(res.body.number).toBe('8001');
      expect(res.body.enabled).toBe(true);
    });

    it('should reject duplicate extension number', async () => {
      const res = await request(app)
        .post('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ number: '8001', sipPassword: 'SipPass@123' });

      expect(res.status).toBe(409);
    });

    it('should reject invalid extension number', async () => {
      const res = await request(app)
        .post('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ number: 'abc', sipPassword: 'SipPass@123' });

      expect(res.status).toBe(400);
    });

    it('should reject short SIP password', async () => {
      const res = await request(app)
        .post('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ number: '8002', sipPassword: '123' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/extensions', () => {
    it('should list all extensions', async () => {
      const res = await request(app)
        .get('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should reject non-admin access', async () => {
      const agent = await createTestAgent({
        extension: '8099',
        password: 'Agent@Test123',
        email: 'nonadmin@test.com',
      });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ extension: '8099', password: 'Agent@Test123' });

      const res = await request(app)
        .get('/api/admin/extensions')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/admin/extensions/:id', () => {
    it('should disable an extension', async () => {
      // First get extensions to find ID
      const listRes = await request(app)
        .get('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`);

      const ext = listRes.body.find((e) => e.number === '8001');
      expect(ext).toBeDefined();

      const res = await request(app)
        .put(`/api/admin/extensions/${ext.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
    });
  });

  describe('DELETE /api/admin/extensions/:id', () => {
    it('should delete an extension', async () => {
      // Create one to delete
      const createRes = await request(app)
        .post('/api/admin/extensions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ number: '8009', sipPassword: 'SipPass@123' });

      const res = await request(app)
        .delete(`/api/admin/extensions/${createRes.body.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
