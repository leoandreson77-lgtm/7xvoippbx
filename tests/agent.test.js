const request = require('supertest');
const app = require('../src/server');
const { createTestAgent, cleanupTestData, disconnectDb } = require('./helpers/setup');

describe('Agent Authorization', () => {
  let agentAToken, agentBToken;

  beforeAll(async () => {
    await cleanupTestData();

    await createTestAgent({
      extension: '7001',
      password: 'AgentA@123',
      email: 'agentA@test.com',
      name: 'Agent A',
    });

    await createTestAgent({
      extension: '7002',
      password: 'AgentB@123',
      email: 'agentB@test.com',
      name: 'Agent B',
    });

    const loginA = await request(app)
      .post('/api/auth/login')
      .send({ extension: '7001', password: 'AgentA@123' });
    agentAToken = loginA.body.token;

    const loginB = await request(app)
      .post('/api/auth/login')
      .send({ extension: '7002', password: 'AgentB@123' });
    agentBToken = loginB.body.token;
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectDb();
  });

  describe('Agent isolation', () => {
    it('Agent A should get their own profile', async () => {
      const res = await request(app)
        .get('/api/agent/profile')
        .set('Authorization', `Bearer ${agentAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Agent A');
      expect(res.body.extension.number).toBe('7001');
    });

    it('Agent B should get their own profile', async () => {
      const res = await request(app)
        .get('/api/agent/profile')
        .set('Authorization', `Bearer ${agentBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Agent B');
      expect(res.body.extension.number).toBe('7002');
    });

    it('Agent A SIP credentials should be for extension 7001', async () => {
      const res = await request(app)
        .get('/api/auth/sip-credentials')
        .set('Authorization', `Bearer ${agentAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sipUri).toContain('7001');
    });

    it('Agent B SIP credentials should be for extension 7002', async () => {
      const res = await request(app)
        .get('/api/auth/sip-credentials')
        .set('Authorization', `Bearer ${agentBToken}`);

      expect(res.status).toBe(200);
      expect(res.body.sipUri).toContain('7002');
    });

    it('Agent should not access admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/extensions')
        .set('Authorization', `Bearer ${agentAToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Status management', () => {
    it('should update agent status', async () => {
      const res = await request(app)
        .put('/api/agent/status')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'ONLINE' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ONLINE');
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .put('/api/agent/status')
        .set('Authorization', `Bearer ${agentAToken}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
    });
  });

  describe('Call history', () => {
    it('should return call list (may be empty)', async () => {
      const res = await request(app)
        .get('/api/agent/calls')
        .set('Authorization', `Bearer ${agentAToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
