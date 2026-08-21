# KRAD Global — Agent Call Center System

Production-ready FreeSWITCH + SIP + WebRTC agent login and call center application.

## Features

- **Real SIP Authentication** — Agents login with extension number + password, validated against the database
- **WebRTC Calling** — Browser-based SIP registration via JsSIP over WSS to FreeSWITCH
- **Real Call Control** — Make/receive calls, mute, hold, DTMF, hangup — all via actual SIP/RTP
- **Dynamic Extensions** — Extensions managed in database, served to FreeSWITCH via `mod_xml_curl`
- **Real-Time Events** — FreeSWITCH events pushed to browser via WebSocket (registration, calls, status)
- **Admin Panel** — Create/manage extensions and agents, monitor live SIP registration status
- **Security** — bcrypt password hashing, JWT auth (HttpOnly cookies), HA1 SIP digest, rate limiting, RBAC

## Architecture

```
Browser (JsSIP)  ──WSS──>  FreeSWITCH (mod_sofia)  ──SIP──>  SIP Trunk  ──>  PSTN
     │                           │
     │                           │ ESL
     │                           ↓
     └──HTTP/WS──>  Node.js Backend  ──>  SQLite/PostgreSQL
                    (Express + ws)
                         │
                         │ mod_xml_curl
                         ↓
                    FreeSWITCH Directory
```

## 🐳 Docker Quick Start (Recommended)

Run the entire system (Node.js backend, WebRTC softphone UI, and FreeSWITCH PBX) with a single command:

```bash
docker compose up --build -d
```

- Web App & Agent Softphone: [http://localhost:3000](http://localhost:3000)
- Admin Panel: [http://localhost:3000/admin](http://localhost:3000/admin) (`admin@kradglobal.com` / `Admin@123`)
- Agent Login: Ext `1001` (`Agent@123`)

👉 See [DOCKER.md](file:///c:/Users/DELL/Desktop/KRAD%20GLOBAL/DOCKER.md) for full Docker options, environment variables, live-reload dev mode, and production guidelines.

---

## 💻 Manual Setup (Bare Metal)

### Prerequisites

- **Node.js 18+**
- **FreeSWITCH** (installed on a Linux server — Ubuntu/Debian recommended)
- **SIP Trunk Provider** (for PSTN calls — e.g., Twilio SIP, Telnyx, VoIP.ms)
- **TLS Certificate** (for WSS — Let's Encrypt recommended)
- **STUN/TURN Server** (optional, Google's public STUN works for most setups)

### 1. Clone and Install

```bash
cd "KRAD GLOBAL"
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Server
PORT=3000

# JWT (CHANGE THIS!)
JWT_SECRET=your-very-long-random-secret-string-min-32-chars

# FreeSWITCH ESL
ESL_HOST=127.0.0.1         # or your FS server IP
ESL_PORT=8021
ESL_PASSWORD=ClueCon        # CHANGE in production!

# SIP Domain (must match FreeSWITCH config)
SIP_DOMAIN=kradglobal.com
SIP_WSS_URL=wss://kradglobal.com:7443

# STUN
STUN_SERVER=stun:stun.l.google.com:19302

# SIP Trunk
SIP_TRUNK_HOST=sip.provider.com
SIP_TRUNK_USERNAME=your-username
SIP_TRUNK_PASSWORD=your-password
SIP_TRUNK_DID=+911234567890
```

### 3. Initialize Database

```bash
npm run db:setup
```

This creates the SQLite database and seeds it with:

| Extension | Agent | Login Password |
|-----------|-------|----------------|
| 1001 | Agent Sameer | Agent@123 |
| 1002 | Agent Priya | Agent@123 |
| 1003 | Agent Rahul | Agent@123 |
| 1004 | Agent Anita | Agent@123 |

Admin login: `admin@kradglobal.com` / `Admin@123` (use admin panel at `/admin`)

### 4. Start the Application

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## FreeSWITCH Configuration

### Install FreeSWITCH (Ubuntu/Debian)

```bash
# Add SignalWire repo
apt-get update && apt-get install -y gnupg2 wget
wget -O /usr/share/keyrings/signalwire-freeswitch-repo.gpg \
  https://freeswitch.signalwire.com/repo/deb/debian-release/signalwire-freeswitch-repo.gpg

echo "deb [signed-by=/usr/share/keyrings/signalwire-freeswitch-repo.gpg] \
  https://freeswitch.signalwire.com/repo/deb/debian-release/ $(lsb_release -sc) main" \
  > /etc/apt/sources.list.d/freeswitch.list

apt-get update
apt-get install -y freeswitch-meta-all
```

### Configure SIP Profile (WebRTC)

Copy the provided config files:

```bash
# Backup originals
cp /etc/freeswitch/sip_profiles/internal.xml /etc/freeswitch/sip_profiles/internal.xml.bak

# Copy our configs
cp freeswitch/sip_profiles/internal.xml /etc/freeswitch/sip_profiles/internal.xml
cp freeswitch/autoload_configs/xml_curl.conf.xml /etc/freeswitch/autoload_configs/xml_curl.conf.xml
cp freeswitch/autoload_configs/event_socket.conf.xml /etc/freeswitch/autoload_configs/event_socket.conf.xml
cp freeswitch/dialplan/default.xml /etc/freeswitch/dialplan/default.xml
cp freeswitch/dialplan/public.xml /etc/freeswitch/dialplan/public.xml
```

### Edit the Configuration

1. **`internal.xml`**: Replace `kradglobal.com` with your actual domain throughout
2. **`internal.xml` → `<gateway>`**: Fill in your SIP trunk provider credentials
3. **`xml_curl.conf.xml`**: Verify the URL points to your Node.js backend (`http://127.0.0.1:3000/fs-config`)
4. **`event_socket.conf.xml`**: **Change the password** from `ClueCon` and update `.env` to match

### TLS Certificates (Required for WSS)

**Option A: Let's Encrypt (Recommended)**

```bash
apt-get install certbot
certbot certonly --standalone -d kradglobal.com

# Link certs to FreeSWITCH
ln -sf /etc/letsencrypt/live/kradglobal.com/fullchain.pem /etc/freeswitch/tls/wss.pem
ln -sf /etc/letsencrypt/live/kradglobal.com/privkey.pem /etc/freeswitch/tls/wss.key

# Also create the combined cert that FreeSWITCH expects
cat /etc/letsencrypt/live/kradglobal.com/fullchain.pem \
    /etc/letsencrypt/live/kradglobal.com/privkey.pem \
    > /etc/freeswitch/tls/agent.pem
cp /etc/letsencrypt/live/kradglobal.com/chain.pem /etc/freeswitch/tls/cafile.pem
```

**Option B: Self-Signed (Dev Only)**

```bash
cd /etc/freeswitch/tls
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout wss.key -out wss.pem \
  -subj "/CN=kradglobal.com"
cat wss.pem wss.key > agent.pem
```

Then visit `https://your-server:7443` in your browser and accept the self-signed cert.

### Load Required Modules

Ensure these are in `/etc/freeswitch/autoload_configs/modules.conf.xml`:

```xml
<load module="mod_sofia"/>
<load module="mod_xml_curl"/>
<load module="mod_event_socket"/>
<load module="mod_commands"/>
<load module="mod_dptools"/>
<load module="mod_dialplan_xml"/>
<load module="mod_opus"/>     <!-- WebRTC codec -->
<load module="mod_g722"/>
<load module="mod_pcmu"/>
<load module="mod_pcma"/>
```

### Restart FreeSWITCH

```bash
systemctl restart freeswitch
```

### Verify

```bash
# Check if FreeSWITCH is running
fs_cli -x "status"

# Check WebSocket binding
fs_cli -x "sofia status profile internal"
# Should show WS-BIND-URL and WSS-BIND-URL

# Check mod_xml_curl is loaded
fs_cli -x "module_exists mod_xml_curl"
```

---

## SIP Provider Configuration

### Generic SIP Trunk Setup

1. Sign up with a SIP trunk provider (Twilio SIP, Telnyx, VoIP.ms, etc.)
2. Get your trunk credentials:
   - **Username** / **Auth ID**
   - **Password**
   - **Proxy / Gateway address** (e.g., `sip.twilio.com`)
   - **DID number** (your business phone number)
3. Update `.env` and `freeswitch/sip_profiles/internal.xml` gateway section
4. Configure the provider to route inbound calls to your FreeSWITCH server's public IP

### Verify Trunk Registration

```bash
fs_cli -x "sofia status gateway sip-trunk"
# Should show: State: REGED
```

---

## STUN/TURN Configuration

For most deployments, Google's public STUN server works:

```
STUN_SERVER=stun:stun.l.google.com:19302
```

If agents are behind strict NATs or firewalls, deploy a TURN server:

```bash
# Install coturn
apt-get install coturn

# Configure /etc/turnserver.conf
listening-port=3478
tls-listening-port=5349
realm=kradglobal.com
user=turnuser:turnpassword
```

Then update `.env`:
```
STUN_SERVER=turn:your-turn-server:3478
```

---

## Testing

### Run Automated Tests

```bash
# Initialize test database first
npm run db:push

# Run tests
npm test
```

### Test Outbound Call

1. Login to `http://localhost:3000` with extension `1001` / password `Agent@123`
2. Verify dashboard shows "SIP: Registered" and "Status: Online"
3. Dial a phone number and press CALL
4. Verify call appears in FreeSWITCH: `fs_cli -x "show channels"`
5. Verify audio flows both ways

### Test Inbound Call

1. Call your DID number from any phone
2. Verify the browser shows "Incoming Call" overlay
3. Click Accept
4. Verify two-way audio

### Test Registration

```bash
# From FreeSWITCH CLI
fs_cli -x "sofia status profile internal reg"
# Should show your registered extensions
```

### Troubleshoot Registration

| Problem | Check |
|---------|-------|
| WSS connection fails | TLS certs valid? Browser console errors? |
| 403 Forbidden | HA1 hash matches? Domain/realm correct? |
| No audio | STUN/TURN configured? Firewall allows UDP 10000-20000? |
| Registration timeout | FreeSWITCH reachable on port 7443? |
| mod_xml_curl fails | Node.js running? Check `http://localhost:3000/fs-config` |

```bash
# Debug SIP registration
fs_cli -x "sofia loglevel all 9"
fs_cli -x "sofia global siptrace on"

# Debug mod_xml_curl
fs_cli -x "xml_curl debug_on"
```

---

## Browser Permissions

WebRTC requires:
- **Microphone access** — Browser will prompt on first call
- **HTTPS** — Required for microphone access in production (localhost is exempt)
- **WSS certificate trust** — If using self-signed certs, visit `https://your-server:7443` first

---

## Project Structure

```
├── package.json
├── prisma/
│   ├── schema.prisma        # Database schema
│   └── seed.js              # Default agents/extensions
├── src/
│   ├── server.js            # Express app entry point
│   ├── config.js            # Environment config
│   ├── constants.js         # Status enums, event types
│   ├── middleware/
│   │   ├── auth.js          # JWT verification
│   │   ├── rateLimiter.js   # Rate limiting
│   │   └── errorHandler.js  # Global error handler
│   ├── routes/
│   │   ├── auth.routes.js   # Login/logout/session/SIP creds
│   │   ├── agent.routes.js  # Agent profile/status/calls/call-control
│   │   ├── admin.routes.js  # Extension & agent CRUD
│   │   └── freeswitch.routes.js  # mod_xml_curl handler
│   ├── services/
│   │   ├── auth.service.js       # Authentication logic
│   │   ├── agent.service.js      # Agent business logic
│   │   ├── extension.service.js  # Extension CRUD
│   │   ├── freeswitch.service.js # ESL connection
│   │   ├── event.service.js      # FS event processing
│   │   └── websocket.service.js  # Browser WebSocket
│   └── utils/
│       ├── crypto.js        # bcrypt, HA1 generation
│       ├── validators.js    # Input validation
│       └── logger.js        # Structured logging
├── public/
│   ├── index.html           # Login page
│   ├── dashboard.html       # Agent dashboard
│   ├── admin.html           # Admin panel
│   ├── css/
│   │   ├── variables.css    # Design system
│   │   ├── login.css
│   │   ├── dashboard.css
│   │   └── admin.css
│   └── js/
│       ├── login.js
│       ├── dashboard.js
│       ├── sip-client.js    # JsSIP wrapper
│       ├── websocket-client.js
│       ├── dialer.js
│       ├── call-controls.js
│       └── admin.js
├── freeswitch/
│   ├── sip_profiles/internal.xml
│   ├── autoload_configs/
│   │   ├── xml_curl.conf.xml
│   │   └── event_socket.conf.xml
│   └── dialplan/
│       ├── default.xml
│       └── public.xml
└── tests/
    ├── auth.test.js
    ├── extension.test.js
    ├── agent.test.js
    ├── freeswitch.test.js
    └── helpers/setup.js
```

## Security Notes

- **Never expose** FreeSWITCH ESL, SIP trunk passwords, or SIP provider credentials to the browser
- SIP credentials are delivered as **HA1 hashes** via authenticated API endpoint — never plaintext
- JWT tokens are stored in **HttpOnly cookies** (not accessible to JS XSS)
- Login is **rate-limited** (10 attempts per 15 minutes per IP)
- Admin routes require **admin role** in JWT
- FreeSWITCH `mod_xml_curl` is called only from **localhost** (no external access)
- Agent A **cannot access** Agent B's extension or data

## License

Proprietary — KRAD Global
