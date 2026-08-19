const { createLogger } = require('../utils/logger');

const log = createLogger('error-handler');

/**
 * Global error handling middleware.
 */
function errorHandler(err, req, res, _next) {
  log.error(`${req.method} ${req.path}`, err.message);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  if (err.code === 'P2002') {
    // Prisma unique constraint violation
    return res.status(409).json({ error: 'A record with that value already exists' });
  }

  if (err.code === 'P2025') {
    // Prisma record not found
    return res.status(404).json({ error: 'Record not found' });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({ error: message });
}

/**
 * 404 handler for unknown routes.
 */
function notFoundHandler(req, res) {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
}

module.exports = { errorHandler, notFoundHandler };
