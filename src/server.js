const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');

const config = require('./config');
const { createLogger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Services
const freeswitchService = require('./services/freeswitch.service');
const eventService = require('./services/event.service');
const websocketService = require('./services/websocket.service');

// Routes
const authRoutes = require('./routes/auth.routes');
const agentRoutes = require('./routes/agent.routes');
const adminRoutes = require('./routes/admin.routes');
const voiceRoutes = require('./routes/voice.routes');
const freeswitchRoutes = require('./routes/freeswitch.routes');

const log = createLogger('server');
const app = express();

// ── Trust Proxy (Required for EasyPanel / Docker Reverse Proxies) ──
app.set('trust proxy', 1);

// ── Security ──────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: false,
}));

app.use(cors({
  origin: true,
  credentials: true,
}));

// ── Parsing ───────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Rate Limiting ─────────────────────────────────
app.use('/api', apiLimiter);

// ── Static Files ──────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Health Check ──────────────────────────────────
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    nodeEnv: config.nodeEnv,
    eslTarget: `${config.freeswitch.host || 'not configured'}:${config.freeswitch.port}`,
    eslConnected: freeswitchService.isConnected ? freeswitchService.isConnected() : false,
  });
});

// ── API Routes ────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/agent', agentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/voice', voiceRoutes);

// ── FreeSWITCH mod_xml_curl endpoint ──────────────
// This is NOT an API route — it's called by FreeSWITCH directly.
// No JWT auth — secured by network (FreeSWITCH is local).
app.use('/fs-config', freeswitchRoutes);

// ── SPA Fallback ──────────────────────────────────
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/fs-config')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Error Handling ────────────────────────────────
app.use('/api', notFoundHandler);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────
const server = http.createServer(app);

// Initialize WebSocket on the HTTP server
websocketService.initialize(server);

// Wire up event service to WebSocket
eventService.setWebsocketService(websocketService);

// Only start listening and ESL when run directly (not when imported by tests)
if (require.main === module) {
  // Validate runtime environment variables (e.g. FREESWITCH_HOST)
  config.validateConfig();

  // Connect to FreeSWITCH ESL
  freeswitchService.connect(eventService.handleFreeSwitchEvent);

  server.listen(config.port, () => {
    log.info(`🚀 7XVOIP Agent System running on http://localhost:${config.port}`);
    log.info(`   Environment: ${config.nodeEnv}`);
    log.info(`   SIP Domain:  ${config.sip.domain}`);
    log.info(`   ESL Target:  ${config.freeswitch.host}:${config.freeswitch.port}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    log.info('SIGTERM received, shutting down...');
    freeswitchService.disconnect();
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    log.info('SIGINT received, shutting down...');
    freeswitchService.disconnect();
    server.close(() => {
      process.exit(0);
    });
  });
}

module.exports = app; // For testing
