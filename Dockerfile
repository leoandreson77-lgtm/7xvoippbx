# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# Stage 1: Build & Dependencies
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/7xvoip?schema=public"

# Install build dependencies for native modules (bcrypt) and OpenSSL for Prisma
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy package manifests
COPY package*.json ./

# Install all dependencies
RUN npm install --legacy-peer-deps

# Copy Prisma schema & source code for Vite build
COPY prisma ./prisma/
COPY vite.config.js ./
COPY public ./public
COPY src ./src

# Generate Prisma Client & Build Vite Production Assets
RUN npx prisma generate
RUN npx vite build

# ─────────────────────────────────────────────────────────────
# Stage 2: Production Runtime
# ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Set production environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="postgresql://postgres:postgres@postgres:5432/7xvoip?schema=public"

# Install runtime dependencies: OpenSSL (for Prisma engine) and curl (for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create directory for persistent SQLite storage
RUN mkdir -p /app/data && chown -R node:node /app

# Copy dependencies and generated prisma client from builder
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package*.json ./

# Copy application source code and built production assets
COPY --from=builder --chown=node:node /app/public ./public
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

# Ensure entrypoint script is executable
RUN chmod +x ./docker-entrypoint.sh

# Run as non-root user
USER node

# Expose HTTP and WebSocket port
EXPOSE 3000

# Container healthcheck (40s start-period to allow DB push & seeding)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Entrypoint initializes database before starting the main process
ENTRYPOINT ["./docker-entrypoint.sh"]

# Default start command (direct node execution for graceful SIGTERM signal handling)
CMD ["node", "src/server.js"]
