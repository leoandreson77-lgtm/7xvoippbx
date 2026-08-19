const request = require('supertest');
const app = require('../src/server');

describe('FreeSWITCH mod_xml_curl', () => {
  describe('POST /fs-config', () => {
    it('should return not-found XML for non-directory sections', async () => {
      const res = await request(app)
        .post('/fs-config')
        .type('form')
        .send({ section: 'dialplan', domain: 'kradglobal.com' });

      expect(res.status).toBe(200);
      expect(res.type).toContain('xml');
      expect(res.text).toContain('not found');
    });

    it('should return not-found for unknown extension', async () => {
      const res = await request(app)
        .post('/fs-config')
        .type('form')
        .send({ section: 'directory', user: 'nonexistent', domain: 'kradglobal.com' });

      expect(res.status).toBe(200);
      expect(res.type).toContain('xml');
      expect(res.text).toContain('not found');
    });

    it('should return not-found when no user specified', async () => {
      const res = await request(app)
        .post('/fs-config')
        .type('form')
        .send({ section: 'directory', domain: 'kradglobal.com' });

      expect(res.status).toBe(200);
      expect(res.type).toContain('xml');
      expect(res.text).toContain('not found');
    });

    // Note: Testing with real extension requires seeded data.
    // The seed.js creates extensions 1001-1004, but tests use isolated data.
    // Integration testing with seeded data would verify the full XML response.
  });
});

describe('FreeSWITCH Service (unit)', () => {
  it('should export expected methods', () => {
    const fs = require('../src/services/freeswitch.service');
    expect(typeof fs.connect).toBe('function');
    expect(typeof fs.getRegistrationStatus).toBe('function');
    expect(typeof fs.unregisterExtension).toBe('function');
    expect(typeof fs.reloadXml).toBe('function');
    expect(typeof fs.originateCall).toBe('function');
    expect(typeof fs.hangupCall).toBe('function');
    expect(typeof fs.holdCall).toBe('function');
    expect(typeof fs.resumeCall).toBe('function');
    expect(typeof fs.sendDtmf).toBe('function');
    expect(typeof fs.isConnected).toBe('function');
    expect(typeof fs.disconnect).toBe('function');
  });

  it('should report disconnected when not connected', () => {
    const fs = require('../src/services/freeswitch.service');
    expect(fs.isConnected()).toBe(false);
  });

  it('should reject API calls when not connected', async () => {
    const fs = require('../src/services/freeswitch.service');
    await expect(fs.hangupCall('fake-uuid')).rejects.toThrow('ESL not connected');
  });
});
