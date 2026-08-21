# 🐳 Docker Deployment Guide — KRAD Global PBX & Call Center

This guide explains how to run and deploy the complete KRAD Global Agent Call Center application (Node.js + WebRTC + FreeSWITCH PBX) using Docker and Docker Compose.

---

## ⚡ Quick Start

### 1. Configure Environment (Optional)
Copy the Docker environment template:
```bash
cp .env.docker .env
```
*(You can customize `JWT_SECRET`, `SIP_DOMAIN`, and SIP trunk credentials as needed).*

### 2. Build & Launch Containers
```bash
docker compose up --build -d
```

### 3. Verify System Status
Check the running services:
```bash
docker compose ps
```

Check real-time application logs:
```bash
docker compose logs -f app
```

Test the healthcheck endpoint:
```bash
curl http://localhost:3000/api/health
```

### 4. Access the Application
- **Agent Login & WebRTC Softphone**: [http://localhost:3000](http://localhost:3000)
- **Agent Dashboard**: [http://localhost:3000/dashboard](http://localhost:3000/dashboard)
- **Admin Control Panel**: [http://localhost:3000/admin](http://localhost:3000/admin)

#### Default Credentials:
| Portal | Username / Email | Password |
|---|---|---|
| **Admin Panel** | `admin@kradglobal.com` | `Admin@123` |
| **Agent Login** | Ext `1001` (or `sameer@kradglobal.com`) | `Agent@123` |
| **Agent Login** | Ext `1002` (or `priya@kradglobal.com`) | `Agent@123` |
| **Agent Login** | Ext `1003` (or `rahul@kradglobal.com`) | `Agent@123` |
| **Agent Login** | Ext `1004` (or `anita@kradglobal.com`) | `Agent@123` |

---

## 🏗️ Architecture in Docker

```
                                 ┌────────────────────────────────────────────────┐
                                 │                 Docker Host                    │
                                 │                                                │
[Browser] ─── HTTP / WS (3000) ──┼───> [krad-app] (Node.js + Express + WS)       │
                                 │         │                                      │
[Browser] ─── WSS / SIP (7443) ──┼──┐      │ ESL (Port 8021)                      │
                                 │  │      ↓                                      │
                                 │  └─> [krad-freeswitch] (FreeSWITCH PBX)        │
                                 │         │                                      │
                                 │         └── mod_xml_curl (http://app:3000) ────┘
                                 │
[SIP Trunk / PSTN] ──────────────┼───> SIP (5060) & RTP Audio (16384-16484 UDP)
                                 └────────────────────────────────────────────────
```

### Services
1. **`app` (`krad-app`)**:
   - Node.js 20 multi-stage production container.
   - Hosts Express REST API, Static WebRTC softphone UI, and WebSocket server.
   - SQLite database persisted via Docker volume `sqlite_data` at `/app/data/app.db`.
   - Connects to FreeSWITCH ESL on `freeswitch:8021`.
   - Responds to FreeSWITCH `mod_xml_curl` dynamic directory lookups at `http://app:3000/fs-config`.

2. **`freeswitch` (`krad-freeswitch`)**:
   - FreeSWITCH 1.10 container.
   - Handles SIP signaling, audio transcoding, WebRTC gateway (WSS), and PSTN trunk bridging.
   - Volumes mounted with dynamic curl configuration (`freeswitch/docker/`).

---

## 🛠️ Common Operations & Cheatsheet

### Starting and Stopping
```bash
# Start all containers in background
docker compose up -d

# Stop all containers
docker compose down

# Stop and delete volumes (WARNING: Resets database and recordings)
docker compose down -v
```

### Viewing Logs
```bash
# Stream all logs
docker compose logs -f

# View Node.js application logs only
docker compose logs -f app

# View FreeSWITCH logs only
docker compose logs -f freeswitch
```

### Running Database Commands inside Container
```bash
# Re-run schema synchronization
docker compose exec app npx prisma db push

# Re-run database seed
docker compose exec app node prisma/seed.js

# Open interactive Node/Prisma Studio (bind port 5555 if needed)
docker compose exec app npx prisma studio --port 5555 --hostname 0.0.0.0
```

### FreeSWITCH CLI Access
Execute FreeSWITCH commands directly via `fs_cli` inside the container:
```bash
# Enter interactive FreeSWITCH CLI
docker compose exec freeswitch fs_cli

# Check registration status of Sofia internal profile
docker compose exec freeswitch fs_cli -x "sofia status profile internal"

# Check SIP Trunk Gateway registration
docker compose exec freeswitch fs_cli -x "sofia status gateway sip-trunk"

# Reload XML configuration
docker compose exec freeswitch fs_cli -x "reloadxml"
```

---

## 💻 Local Development Mode (Hot-Reload)

To run the containerized app with live source code mounting and auto-restart on file changes:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```
Any modifications in `./src/` or `./public/` will immediately reflect without rebuilding the image.

---

## 🔒 Production Guidelines

1. **Change Default Secrets**:
   - Generate a secure 32+ character `JWT_SECRET` in `.env`.
   - Update `ESL_PASSWORD` in `.env` and `freeswitch/docker/autoload_configs/event_socket.conf.xml`.
   - Update the admin password in the Admin Panel or database seed.

2. **TLS / SSL for WebRTC (WSS)**:
   - WebRTC requires secure WebSocket (`wss://`) in production browsers.
   - Mount your Let's Encrypt certificates into the FreeSWITCH container:
     ```yaml
     volumes:
       - /etc/letsencrypt/live/yourdomain.com/fullchain.pem:/etc/freeswitch/tls/wss.pem:ro
       - /etc/letsencrypt/live/yourdomain.com/privkey.pem:/etc/freeswitch/tls/wss.key:ro
     ```

3. **Firewall & NAT Settings**:
   - Ensure the following ports are open on your host firewall:
     - `3000/tcp` (Web UI & API, or proxy via Nginx/Caddy on 80/443)
     - `5060/udp`, `5060/tcp` (SIP)
     - `5061/tcp` (SIP TLS)
     - `7443/tcp` (WebRTC WSS)
     - `16384-16484/udp` (RTP Audio)
