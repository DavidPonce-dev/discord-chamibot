# Stage 1: Build
FROM node:22-bookworm AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Production
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
  ffmpeg \
  ca-certificates \
  unzip \
  # Playwright dependencies (for headless refresh)
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libxshmfence1 \
  libx11-xcb1 \
  libxfixes3 \
  fonts-liberation \
  xdg-utils \
  # Xvfb + VNC (only needed for interactive login setup)
  xvfb \
  x11vnc \
  novnc \
  websockify \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Install deno (required by yt-dlp for YouTube JS extraction)
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then DENO_ARCH="aarch64-unknown-linux-gnu"; \
    else DENO_ARCH="x86_64-unknown-linux-gnu"; fi && \
    wget -q "https://github.com/denoland/deno/releases/latest/download/deno-${DENO_ARCH}.zip" -O /tmp/deno.zip && \
    unzip -o /tmp/deno.zip -d /usr/local/bin && \
    chmod +x /usr/local/bin/deno && \
    rm /tmp/deno.zip
ENV PATH="/usr/local/bin:$PATH"

# Install yt-dlp for YouTube URL extraction, where the node user can replace it: YouTube changes
# break old builds, so the bot updates it in place (YTDLP_AUTO_UPDATE) instead of waiting for a deploy
RUN mkdir -p /home/node/bin \
  && wget -O /home/node/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod +x /home/node/bin/yt-dlp \
  && chown -R node:node /home/node/bin
ENV PATH="/home/node/bin:$PATH"
ENV YTDLP_AUTO_UPDATE=true

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# Set Playwright browsers path to a non-root accessible location BEFORE installing
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

# System libraries Chromium needs beyond the ones above (needs root)
RUN npx playwright install-deps chromium 2>/dev/null || true

# Create directories with proper ownership for non-root user
RUN mkdir -p /cookies /profile /app/data /home/node/.cache && chown -R node:node /cookies /profile /app/data /home/node/.cache

ENV NODE_OPTIONS=--no-deprecation
USER node

# Install Chromium as the runtime user (into PLAYWRIGHT_BROWSERS_PATH): installing it as root and
# chown-ing it afterwards stored the whole browser a second time in another layer
RUN npx playwright install chromium

# Fail the build if the browser is not where Playwright will look for it
RUN node -e "const fs = require('fs'); const p = require('playwright').chromium.executablePath(); if (!fs.existsSync(p)) { console.error('Chromium missing: ' + p); process.exit(1) } console.log('Chromium at ' + p)"

# Run node directly: behind npm/sh the SIGTERM of a deploy may never reach the graceful shutdown
CMD ["node", "dist/index.js"]
