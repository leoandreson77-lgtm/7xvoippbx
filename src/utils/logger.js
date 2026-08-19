const config = require('../config');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = config.isDev ? LOG_LEVELS.debug : LOG_LEVELS.info;

function formatMessage(level, module, message, data) {
  const timestamp = new Date().toISOString();
  const base = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${typeof data === 'object' ? JSON.stringify(data) : data}`;
  }
  return base;
}

function createLogger(module) {
  return {
    error(message, data) {
      if (currentLevel >= LOG_LEVELS.error) {
        console.error(formatMessage('error', module, message, data));
      }
    },
    warn(message, data) {
      if (currentLevel >= LOG_LEVELS.warn) {
        console.warn(formatMessage('warn', module, message, data));
      }
    },
    info(message, data) {
      if (currentLevel >= LOG_LEVELS.info) {
        console.info(formatMessage('info', module, message, data));
      }
    },
    debug(message, data) {
      if (currentLevel >= LOG_LEVELS.debug) {
        console.debug(formatMessage('debug', module, message, data));
      }
    },
  };
}

module.exports = { createLogger };
