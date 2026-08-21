require('dotenv').config();

// Determine FreeSWITCH / ESL Connection settings from environment
const freeswitchHost = process.env.FREESWITCH_HOST || process.env.ESL_HOST || '';
const freeswitchPort = parseInt(process.env.FREESWITCH_PORT || process.env.ESL_PORT, 10) || 8021;
const freeswitchPassword = process.env.FREESWITCH_PASSWORD || process.env.ESL_PASSWORD || 'ClueCon';

/**
 * Validate required runtime environment variables.
 * Fails fast with clear error if FREESWITCH_HOST is missing in non-test runtime.
 */
function validateConfig() {
  const isTest = (process.env.NODE_ENV || 'development') === 'test';

  if (!isTest && !freeswitchHost) {
    throw new Error(
      '❌ [CONFIG ERROR] Missing required environment variable: FREESWITCH_HOST\n' +
      'Please set FREESWITCH_HOST in your EasyPanel / Docker environment variables (e.g. FREESWITCH_HOST=freeswitch_freeswitch).\n' +
      'Hardcoded fallback to 127.0.0.1 has been removed for container compatibility.'
    );
  }
}

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiry: process.env.JWT_EXPIRY || '7d',
  },

  freeswitch: {
    host: freeswitchHost,
    port: freeswitchPort,
    password: freeswitchPassword,
  },
  // Alias for backward compatibility with existing code
  get esl() {
    return this.freeswitch;
  },

  sip: {
    domain: process.env.SIP_DOMAIN || 'kradglobal.com',
    wssUrl: process.env.SIP_WSS_URL || 'wss://kradglobal.com:7443',
    stunServer: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302',
  },

  trunk: {
    host: process.env.SIP_TRUNK_HOST || '',
    username: process.env.SIP_TRUNK_USERNAME || '',
    password: process.env.SIP_TRUNK_PASSWORD || '',
    did: process.env.SIP_TRUNK_DID || '',
  },

  rateLimit: {
    loginWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 900000,
    loginMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  },

  validateConfig,
};

module.exports = config;
