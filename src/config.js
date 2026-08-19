require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiry: process.env.JWT_EXPIRY || '15m',
  },

  esl: {
    host: process.env.ESL_HOST || '127.0.0.1',
    port: parseInt(process.env.ESL_PORT, 10) || 8021,
    password: process.env.ESL_PASSWORD || 'ClueCon',
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
};

module.exports = config;
