#!/bin/sh
set -e

# ── Ensure Data Directory ──────────────────────────────────
# Create SQLite data directory if it does not exist
mkdir -p /app/data 2>/dev/null || true

# Default DATABASE_URL if not provided
if [ -z "$DATABASE_URL" ]; then
  export DATABASE_URL="postgresql://postgres:postgres@postgres:5432/7xvoip?schema=public"
fi

FS_HOST="${FREESWITCH_HOST:-${ESL_HOST:-}}"
FS_PORT="${FREESWITCH_PORT:-${ESL_PORT:-8021}}"

echo "=================================================="
echo "  7XVOIP PBX & Call Center System (Docker)"
echo "=================================================="
echo "  Environment:   ${NODE_ENV:-production}"
echo "  Database URL:  ${DATABASE_URL}"
echo "  SIP Domain:    ${SIP_DOMAIN:-7xvoip.com}"
if [ -n "$FS_HOST" ]; then
  echo "  ESL Target:    ${FS_HOST}:${FS_PORT}"
else
  echo "  ESL Target:    (FREESWITCH_HOST not configured)"
fi
echo "=================================================="

# ── Database Sync ──────────────────────────────────────────
echo "🔄 Synchronizing database schema with Prisma..."
npx prisma db push --skip-generate

# ── Database Seeding ───────────────────────────────────────
# Run database seed if SEED_DATABASE is enabled (default: true on startup)
if [ "${SEED_DATABASE:-true}" = "true" ]; then
  echo "🌱 Verifying default admin, agents, and SIP trunks..."
  node prisma/seed.js || echo "⚠️ Seeding completed with notes."
fi

# ── Execute Application Process ────────────────────────────
echo "🚀 Starting application process: $@"
exec "$@"
