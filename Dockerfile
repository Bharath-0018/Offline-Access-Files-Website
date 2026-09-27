# Production Dockerfile for OfflineAccess.com
FROM node:22-bookworm-slim

# Install system dependencies (curl for healthcheck)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    PUBLIC_DOMAIN=OfflineAccess.com \
    STORAGE_DIR=/data/storage \
    DB_PATH=/data/cloud.db

# Copy project files
COPY package.json ./
COPY lib/ ./lib/
COPY public/ ./public/
COPY server.js ./

# Create persistent storage mount directory
RUN mkdir -p /data/storage /data/temp && \
    chmod -R 777 /data

# Persistent volume for database and user files
VOLUME ["/data"]

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start production server
CMD ["node", "server.js"]
