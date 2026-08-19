/**
 * Validate extension number: 3-6 digits.
 */
function isValidExtension(ext) {
  return /^\d{3,6}$/.test(ext);
}

/**
 * Validate password: at least 6 characters.
 */
function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

/**
 * Validate email address.
 */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate a phone number / dial string.
 * Allows digits, *, #, + with minimum 3 chars.
 */
function isValidDialString(number) {
  return /^[+*#\d]{3,20}$/.test(number);
}

/**
 * Sanitize string input — trim and remove control characters.
 */
function sanitize(str) {
  if (typeof str !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return str.trim().replace(/[\x00-\x1f\x7f]/g, '');
}

module.exports = {
  isValidExtension,
  isValidPassword,
  isValidEmail,
  isValidDialString,
  sanitize,
};
