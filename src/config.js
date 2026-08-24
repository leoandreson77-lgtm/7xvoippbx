require('dotenv').config();

// Determine FreeSWITCH / ESL Connection settings from environment
const freeswitchHost = process.env.FREESWITCH_HOST || process.env.ESL_HOST || 'freeswitch';
const freeswitchPort = parseInt(process.env.FREESWITCH_PORT || process.env.ESL_PORT, 10) || 8021;
const freeswitchPassword = process.env.FREESWITCH_PASSWORD || process.env.ESL_PASSWORD || 'ClueCon';

/**
 * Validate runtime environment configuration.
 * Logs target settings on startup.
 */
function validateConfig() {
  const isTest = (process.env.NODE_ENV || 'development') === 'test';

  if (!isTest && !process.env.FREESWITCH_HOST && !process.env.ESL_HOST) {
    console.log('ℹ️ [CONFIG] FREESWITCH_HOST variable not set; defaulting ESL target to "freeswitch:8021"');
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
    domain: process.env.SIP_DOMAIN || '7xvoip.com',
    wssUrl: process.env.SIP_WSS_URL || 'wss://7xvoip.com:7443',
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
