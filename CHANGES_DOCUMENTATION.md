# 📋 Complete Changes Documentation — FreeSWITCH ESL & Docker/EasyPanel Fix

This document provides a detailed record of all changes made to the **KRAD Global Agent System** codebase to resolve the FreeSWITCH ESL connection issue in Docker and EasyPanel environments.

---

## 🎯 1. Overview & Root Cause Analysis

### Problem:
When running the Node.js backend container on EasyPanel alongside a separate FreeSWITCH container (`freeswitch_freeswitch`), the application logged:
```text
ESL Target: 127.0.0.1:8021
[ERROR] [freeswitch-service] ESL connection error connect ECONNREFUSED 127.0.0.1:8021
```

### Root Causes Identified:
1. **Hardcoded Fallback in Code**: `src/config.js` only checked `process.env.ESL_HOST || '127.0.0.1'`, ignoring `FREESWITCH_HOST`.
2. **Missing Startup Validation**: If `FREESWITCH_HOST` was missing or misnamed, the code silently defaulted to `127.0.0.1` (localhost of the Node.js container itself, instead of the FreeSWITCH container).
3. **Aggressive Retry Loop**: `src/services/freeswitch.service.js` lacked exponential backoff and failed without descriptive connection logging.

---

## 📁 2. List of Modified & Created Files

| File | Status | Purpose of Change |
|---|---|---|
| [`src/config.js`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/src/config.js) | **MODIFIED** | Reads `FREESWITCH_HOST`, `FREESWITCH_PORT`, `FREESWITCH_PASSWORD` at runtime. Removes `127.0.0.1` hardcoded fallback. Adds `validateConfig()`. |
| [`src/server.js`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/src/server.js) | **MODIFIED** | Added `config.validateConfig()` on startup. Updated `/health` endpoint and startup logs to display `config.freeswitch.host:port`. |
| [`src/services/freeswitch.service.js`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/src/services/freeswitch.service.js) | **MODIFIED** | Refactored ESL connection to use `config.freeswitch`, added host validation, friendly error logging, and exponential reconnect backoff. |
| [`docker-entrypoint.sh`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/docker-entrypoint.sh) | **MODIFIED** | Updated startup banner to read and display `FREESWITCH_HOST`. |
| [`.env`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/.env) | **MODIFIED** | Updated variable names to `FREESWITCH_HOST`, `FREESWITCH_PORT`, `FREESWITCH_PASSWORD`. |
| [`.env.example`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/.env.example) | **MODIFIED** | Updated template with documented `FREESWITCH_HOST` variables. |
| [`.env.docker`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/.env.docker) | **MODIFIED** | Updated Docker environment template for `freeswitch_freeswitch`. |
| [`docker-compose.yml`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/docker-compose.yml) | **MODIFIED** | Configured `FREESWITCH_HOST=${FREESWITCH_HOST:-freeswitch_freeswitch}` and image `leoaddre/7xvoip:latest`. |
| [`docker-compose.dev.yml`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/docker-compose.dev.yml) | **MODIFIED** | Updated development compose override with `FREESWITCH_HOST`. |
| [`package.json`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/package.json) | **MODIFIED** | Added `docker:push` script targeting `leoaddre/7xvoip:latest`. |
| [`tests/freeswitch.test.js`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/tests/freeswitch.test.js) | **MODIFIED** | Added unit tests verifying `validateConfig()` and `freeswitch` config properties. |
| [`push-to-7xvoip.bat`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/push-to-7xvoip.bat) | **CREATED** | 1-Click Windows batch script to build and push directly to `leoaddre/7xvoip:latest`. |

---

## 🔍 3. Exact Code Differences (Before vs After)

### 1. `src/config.js`
#### 🔴 Before:
```javascript
require('dotenv').config();

const config = {
  // ...
  esl: {
    host: process.env.ESL_HOST || '127.0.0.1',
    port: parseInt(process.env.ESL_PORT, 10) || 8021,
    password: process.env.ESL_PASSWORD || 'ClueCon',
  },
  // ...
};
```

#### 🟢 After:
```javascript
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
    expiry: process.env.JWT_EXPIRY || '15m',
  },

  freeswitch: {
    host: freeswitchHost,
    port: freeswitchPort,
    password: freeswitchPassword,
  },
  // Alias for backward compatibility with existing codebase
  get esl() {
    return this.freeswitch;
  },

  // ... (SIP, Trunk, RateLimit unchanged)
  validateConfig,
};

module.exports = config;
```

---

### 2. `src/server.js`
#### 🔴 Before:
```javascript
if (require.main === module) {
  freeswitchService.connect(eventService.handleFreeSwitchEvent);

  server.listen(config.port, () => {
    log.info(`🚀 KRAD Global Agent System running on http://localhost:${config.port}`);
    log.info(`   Environment: ${config.nodeEnv}`);
    log.info(`   SIP Domain:  ${config.sip.domain}`);
    log.info(`   ESL Target:  ${config.esl.host}:${config.esl.port}`);
  });
}
```

#### 🟢 After:
```javascript
// Health check route includes current ESL target
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

if (require.main === module) {
  // Validate runtime environment variables at boot
  config.validateConfig();

  // Connect to FreeSWITCH ESL
  freeswitchService.connect(eventService.handleFreeSwitchEvent);

  server.listen(config.port, () => {
    log.info(`🚀 KRAD Global Agent System running on http://localhost:${config.port}`);
    log.info(`   Environment: ${config.nodeEnv}`);
    log.info(`   SIP Domain:  ${config.sip.domain}`);
    log.info(`   ESL Target:  ${config.freeswitch.host}:${config.freeswitch.port}`);
  });
}
```

---

### 3. `src/services/freeswitch.service.js`
#### 🔴 Before:
```javascript
function connect(onEvent) {
  if (isConnecting) return;
  isConnecting = true;
  // Connected using config.esl.host with 5s hardcoded reconnect loop
}
```

#### 🟢 After:
```javascript
let reconnectInterval = 5000;
const MAX_RECONNECT_INTERVAL = 30000;

function connect(onEvent) {
  if (!config.freeswitch.host) {
    log.error('Cannot connect to FreeSWITCH ESL: FREESWITCH_HOST environment variable is missing.');
    return;
  }

  if (isConnecting) return;
  isConnecting = true;

  try {
    const esl = require('modesl');

    const conn = new esl.Connection(
      config.freeswitch.host,
      config.freeswitch.port,
      config.freeswitch.password,
      () => {
        isConnecting = false;
        eslConnection = conn;
        reconnectInterval = 5000; // Reset backoff on success
        log.info(`✓ Connected to FreeSWITCH ESL at ${config.freeswitch.host}:${config.freeswitch.port}`);
        // ... (events subscription)
      }
    );

    conn.on('error', (err) => {
      isConnecting = false;
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        log.warn(`FreeSWITCH ESL is unreachable at ${config.freeswitch.host}:${config.freeswitch.port} (${err.message}). Retrying in ${Math.round(reconnectInterval / 1000)}s...`);
      } else {
        log.error('ESL connection error', err.message);
      }
      scheduleReconnect(onEvent);
    });

    conn.on('esl::end', () => {
      isConnecting = false;
      eslConnection = null;
      log.warn('ESL connection closed');
      scheduleReconnect(onEvent);
    });
  } catch (err) {
    isConnecting = false;
    log.error('Failed to create ESL connection', err.message);
    scheduleReconnect(onEvent);
  }
}

function scheduleReconnect(onEvent) {
  if (!config.freeswitch.host) return;
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    log.info(`Attempting ESL reconnect to ${config.freeswitch.host}:${config.freeswitch.port}...`);
    connect(onEvent);
  }, reconnectInterval);

  // Exponential backoff up to 30s
  reconnectInterval = Math.min(Math.round(reconnectInterval * 1.5), MAX_RECONNECT_INTERVAL);
}
```

---

## ⚙️ 4. EasyPanel Environment Variables

Set these environment variables in your EasyPanel Node.js application service:

```env
# ── FreeSWITCH ESL Connection ─────────────────
FREESWITCH_HOST=freeswitch_freeswitch
FREESWITCH_PORT=8021
FREESWITCH_PASSWORD=ClueCon

# ── Application Configuration ─────────────────
PORT=3000
NODE_ENV=production
DATABASE_URL=file:/app/data/app.db
JWT_SECRET=your-secure-random-jwt-secret-min-32-chars
SIP_DOMAIN=kradglobal.com
SIP_WSS_URL=wss://kradglobal.com:7443
```

---

## 🚀 5. Deployment Guide

### Option 1: Double-Click Script (Windows)
Double-click [`push-to-7xvoip.bat`](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/push-to-7xvoip.bat) to build and push to `leoaddre/7xvoip:latest`.

### Option 2: Manual Terminal Commands
```bash
# 1. Login to Docker Hub
docker login

# 2. Build and Tag image
docker build -t leoaddre/7xvoip:latest .

# 3. Push to Docker repository
docker push leoaddre/7xvoip:latest
```

### In EasyPanel:
Click **Re-deploy** or trigger image pull from `leoaddre/7xvoip:latest`.

---

## 🧪 6. Expected Logs on Startup

```text
==================================================
  KRAD Global PBX & Call Center System (Docker)
==================================================
  Environment:   production
  Database URL:  file:/app/data/app.db
  SIP Domain:    kradglobal.com
  ESL Target:    freeswitch_freeswitch:8021
==================================================
🔄 Synchronizing database schema with Prisma...
🌱 Verifying default admin, agents, and SIP trunks...
🚀 Starting application process: npm start

> krad-global-agent-system@1.0.0 start
> node src/server.js

[INFO] [websocket-service] WebSocket server initialized on /ws
[INFO] [freeswitch-service] ✓ Connected to FreeSWITCH ESL at freeswitch_freeswitch:8021
[INFO] [server] 🚀 KRAD Global Agent System running on http://localhost:3000
[INFO] [server]    Environment: production
[INFO] [server]    SIP Domain:  kradglobal.com
[INFO] [server]    ESL Target:  freeswitch_freeswitch:8021
```
