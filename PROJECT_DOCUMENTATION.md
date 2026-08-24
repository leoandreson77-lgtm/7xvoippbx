# 🚀 KRAD GLOBAL — 7XVOIP Enterprise PBX & Call Center System
## Comprehensive System Architecture & AI Technical Documentation

> **Purpose of this Document:**  
> This file is a complete, authoritative guide designed to give any AI assistant or developer full context on the architecture, technical stack, database schema, telephony/VoIP integrations, API routes, security model, and current state of the **KRAD Global / 7XVOIP Call Center System**.

---

## 1. Executive Summary & Core Objectives

**KRAD Global (7XVOIP)** is an enterprise-grade, browser-based call center & PBX management application powered by **Node.js, Express, Prisma ORM, React 19, FreeSWITCH PBX, and WebRTC (JsSIP)**.

### Key Capabilities:
- **WebRTC Softphone**: Agents log in to the web browser and make/receive live PSTN & internal calls directly using WebRTC (`JsSIP` over `WSS`).
- **Dynamic PBX Provisioning**: FreeSWITCH uses `mod_xml_curl` to authenticate extensions dynamically against the SQLite/PostgreSQL database (no manual XML editing required).
- **Real-Time Telephony Control**: FreeSWITCH Event Socket Library (ESL) tracks live channel state, caller IDs, call durations, and supervisor actions (barge, listen, whisper, hangup).
- **Live WebSocket Dashboard**: Pushes real-time agent registration updates, incoming call notifications, and call status to the frontend.
- **Admin Management Portal**: Complete CRUD controls for Agents, Extensions, Toll-Free Numbers (TFN / DID), SIP Trunks (Telnyx, Twilio, VoIP.ms), and CDR (Call Detail Records) logs.

---

## 2. Tech Stack & Architecture

### Backend:
- **Runtime**: Node.js (v18+)
- **HTTP Server**: Express.js
- **Database & ORM**: **PostgreSQL** with **Prisma ORM** (`@prisma/client` v6)
- **VoIP Integration**:
  - `modesl`: Node.js FreeSWITCH Event Socket Library (ESL) client
  - `mod_xml_curl`: Dynamic HTTP authentication directory hook
- **Real-Time Socket**: `ws` (native WebSocket library for bidirectional browser sync)
- **Security**: `bcrypt` (Password Hashing), `jsonwebtoken` (JWT in HttpOnly Cookies), `helmet` (CSP & Header Hardening), `express-rate-limit`

### Frontend:
- **Framework**: **React 19** with `react-router-dom` (v7) & `lucide-react`
- **Build Tool**: **Vite** (bundling to `public/dist/`)
- **Telephony Client**: `sip.js` / `JsSIP` (WebRTC over WSS on FreeSWITCH port 7443)
- **CSS Architecture**: Vanilla Modular CSS design system (`public/css/admin.css`, `public/css/variables.css`, `dashboard.css`, `login.css`).  
  *Note: External CDN scripts (like Tailwind CDN) were intentionally replaced with local CSS due to strict Helmet CSP security policies.*

---

## 3. System Architecture Diagram

```text
               +-------------------------------------------------------+
               |                  Browser / Web Client                 |
               |     (React 19 SPA + JsSIP Softphone + WebSocket)       |
               +---------------------------+---------------------------+
                                           |
                    WSS (Port 7443)        | HTTP / WS (Port 3000)
            +------------------------------+---------------------------+
            |                                                          |
            v                                                          v
+-----------------------+   ESL (Port 8021)   +----------------------------------+
| FreeSWITCH PBX        |<------------------->| Node.js / Express Backend        |
| (mod_sofia, mod_opus) |                     | (Server, API, WebSocket, ESL)    |
+-----------+-----------+                     +----------------+-----------------+
            |                                                  |
            | mod_xml_curl (HTTP POST /fs-config)              | Prisma ORM
            +------------------------------------------------->|
                                                               v
                                                    +--------------------+
                                                    |  SQLite / Postgres |
                                                    |  Database          |
                                                    +--------------------+
```

---

## 4. Database Schema (Prisma)

The application data model revolves around `Agent`, `Extension`, `TfnNumber`, `SipTrunk`, `CallLog`, and `AuditLog`.

### Key Entities & Relations:

1. **`Agent`**: Represents call center operators & admins.
   - Roles: `"agent"` | `"admin"`
   - Status: `"OFFLINE"` | `"AVAILABLE"` | `"ON_CALL"` | `"BREAK"`
   - Relation: 1-to-1 with `Extension`
2. **`Extension`**: Represents PBX internal extensions (e.g., `1001`, `1002`).
   - Fields: `number`, `sipUsername`, `sipPasswordHash`, `sipHa1` (MD5 of `user:realm:password` for SIP Digest Auth), `realm`, `registered`, `callsReceiveOn`.
   - Relation: Belongs to `Agent` (optional), belongs to `TfnNumber` (Outbound DID mapping).
3. **`TfnNumber`**: Toll-Free / DID numbers purchased from SIP carriers.
   - Fields: `number` (e.g. `+18001234567`), `label`.
   - Relation: Belongs to a `SipTrunk`, has many `Extension`s.
4. **`SipTrunk`**: Outbound/Inbound SIP carrier gateways (Telnyx, Twilio, etc.).
   - Fields: `name`, `provider`, `host`, `port` (5060), `username`, `password`, `didNumber`.
5. **`CallLog`**: Complete CDR records for analytics.
   - Fields: `extensionId`, `tfnNumber`, `direction` (`"inbound"`/`"outbound"`), `callerNumber`, `calleeNumber`, `status` (`"answered"`/`"missed"`/`"failed"`), `duration`, `callUuid`.

---

## 5. Telephony Integration Breakdown

### 5.1 Dynamic Directory Authentication (`/fs-config`)
When an extension attempts to register over WSS, FreeSWITCH sends an HTTP request to `http://localhost:3000/fs-config`.  
The backend (`freeswitch.routes.js` & `freeswitch.service.js`) looks up the extension in Prisma, returns an XML directory document containing the pre-computed `sip-a1-hash` (SIP HA1), allowing FreeSWITCH to validate the password securely without knowing plaintext credentials.

### 5.2 Event Socket Library (ESL) Listener (`freeswitch.service.js`)
The backend maintains a persistent TCP ESL connection to FreeSWITCH (port 8021).
- Subscribes to events: `CHANNEL_CREATE`, `CHANNEL_ANSWER`, `CHANNEL_DESTROY`, `CUSTOM sofia::register`, `CUSTOM sofia::unregister`.
- Automates database status updates (e.g., updates `Extension.registered = true` when registered).
- Enables live supervisor actions (`originate`, `uuid_kill`, `uuid_eavesdrop`).

### 5.3 Browser WebRTC Softphone (`sip-client.js` / React hooks)
- Connects to `wss://<DOMAIN>:7443` via JsSIP.
- Requests SIP credentials securely via `/api/auth/sip-credentials` (JWT authenticated).
- Renders call control UI: Dialpad, Mute, Hold, DTMF, Transfer, Hangup, and incoming call alerts.

---

## 6. Directory Structure Overview

```text
├── package.json               # Dependencies & scripts
├── vite.config.js             # Vite build configuration
├── prisma/
│   ├── schema.prisma          # Database models definition
│   └── seed.js                # Default seed data (Agents 1001-1004 & Admin)
├── src/
│   ├── server.js              # Server entry point (Express + HTTP/WS server)
│   ├── config.js              # Environment variable loading
│   ├── constants.js           # Enums & system constants
│   ├── middleware/
│   │   ├── auth.js            # JWT verification & RBAC middleware
│   │   ├── rateLimiter.js     # Express rate limiters
│   │   └── errorHandler.js    # Global error response handler
│   ├── routes/
│   │   ├── auth.routes.js     # /api/auth (Login, Logout, Session, SIP creds)
│   │   ├── admin.routes.js    # /api/admin (Dashboard CRUD, Extensions, Agents, CDR, Supervisor)
│   │   ├── agent.routes.js    # /api/agent (Agent profile & personal call history)
│   │   └── freeswitch.routes.js # /fs-config (FreeSWITCH mod_xml_curl dynamic directory)
│   ├── services/
│   │   ├── auth.service.js       # Auth logic & JWT cookie generation
│   │   ├── agent.service.js      # Agent status management
│   │   ├── extension.service.js  # Extension CRUD & HA1 generation
│   │   ├── freeswitch.service.js # ESL TCP client & mod_xml_curl handler
│   │   ├── event.service.js      # Internal event router
│   │   └── websocket.service.js  # Browser WebSocket broadcast manager
│   ├── utils/
│   │   ├── crypto.js          # Password bcrypt & SIP HA1 generator
│   │   ├── validators.js      # Input validation helpers
│   │   └── logger.js          # Structured console logger
│   └── client/                # React 19 Frontend SPA
│       ├── main.jsx           # App entry point
│       ├── App.jsx            # Routing & main component wrapper
│       ├── context/
│       │   ├── AuthContext.jsx # Auth state & token headers supplier
│       │   └── SipContext.jsx  # WebRTC Sip.js state management
│       ├── pages/
│       │   ├── LoginPage.jsx   # Modern glassmorphism login UI
│       │   ├── DashboardPage.jsx # Agent softphone dashboard
│       │   └── AdminPage.jsx   # Admin PBX management portal
│       └── components/
│           ├── EditExtensionModal.jsx # Extension edit dialog
│           ├── EditTrunkModal.jsx     # SIP Trunk edit dialog
│           ├── SipCredentialsModal.jsx# SIP Credentials viewer
│           └── SupervisorModal.jsx    # Live call supervisor control modal
├── public/
│   ├── css/
│   │   ├── variables.css      # Core color palette & CSS design tokens
│   │   ├── admin.css          # Comprehensive Admin CSS styling system
│   │   ├── dashboard.css      # Softphone & dialer layout styles
│   │   └── login.css          # Auth form styles
│   ├── index.html             # React SPA mounting point
│   └── dist/                  # Compiled Vite assets output
```

---

## 7. Key API Endpoints Reference

### 🔒 Authentication (`/api/auth`)
- `POST /api/auth/login` — Authenticate agent/admin, returns JWT in HttpOnly cookie.
- `POST /api/auth/logout` — Clears JWT cookie.
- `GET /api/auth/me` — Returns current logged-in user profile.
- `GET /api/auth/sip-credentials` — Securely fetches SIP username, HA1 key, and server WSS endpoint for WebRTC registration.

### 🛠️ Admin Dashboard (`/api/admin`)
- `GET /api/admin/stats` — Overall system KPIs (Total agents, extensions, live active channels).
- `GET/POST /api/admin/extensions` — List or create new PBX extensions.
- `PUT/DELETE /api/admin/extensions/:id` — Update or delete extension.
- `GET/POST/DELETE /api/admin/tfns` — Toll-Free / DID numbers management.
- `GET/POST/DELETE /api/admin/trunks` — SIP Trunk gateway management.
- `GET/POST/DELETE /api/admin/agents` — Call center agent roster CRUD.
- `GET /api/admin/cdr` — Call Detail Records with search, date range & status filters.
- `POST /api/admin/supervisor/action` — Execute ESL commands (barge, listen, whisper, hangup).

---

## 8. Common Developer Workflows & Commands

### Setup & Run (Bare Metal):
```bash
# 1. Install dependencies
npm install

# 2. Configure Environment variables
cp .env.example .env

# 3. Setup SQLite Database & seed initial users
npm run db:setup

# 4. Run Development Server (Backend watcher + static assets)
npm run dev
```

### Build Frontend SPA (Vite):
```bash
npm run build
```

### Docker Quickstart:
```bash
docker compose up --build -d
```

---

## 9. Important Notes for AI Assistants

1. **Helmet & Content Security Policy (CSP)**:  
   `src/server.js` uses strict Helmet CSP configuration. Do **NOT** introduce external CDN scripts (such as `<script src="https://cdn.tailwindcss.com">`). All UI components must use native CSS classes defined in `public/css/admin.css` or `public/css/variables.css`.
2. **SIP Security**:  
   Plaintext SIP passwords are NEVER sent to the browser or stored in plaintext in the DB. The system relies on bcrypt for app logins and MD5 HA1 keys (`username:realm:password`) for FreeSWITCH SIP Digest Authentication.
3. **Modal Design Standard**:  
   All React modal components follow the `.modal-overlay` -> `.modal-card` structure styled in `admin.css`.
4. **React Router SPA**:  
   The primary UI is driven by React in `src/client/`. Express serves `public/index.html` for single-page routing fallbacks.

---
*Documentation maintained for KRAD Global / 7XVOIP Enterprise System.*
