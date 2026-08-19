const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

/**
 * Hash a plaintext password with bcrypt.
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate SIP Digest HA1 hash: MD5(username:realm:password)
 * Used by FreeSWITCH for SIP authentication.
 */
function generateHa1(username, realm, password) {
  return crypto
    .createHash('md5')
    .update(`${username}:${realm}:${password}`)
    .digest('hex');
}

/**
 * Generate a cryptographically secure random string.
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  generateHa1,
  generateSecureToken,
};
