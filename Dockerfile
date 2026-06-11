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

# Install yt-dlp for YouTube URL extraction
RUN wget -O /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/dist ./dist

# Set Playwright browsers path to a non-root accessible location BEFORE installing
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

# Install Playwright and Chromium (will use PLAYWRIGHT_BROWSERS_PATH)
RUN npx playwright install chromium \
  && npx playwright install-deps chromium 2>/dev/null || true

# Verify Chromium binary exists
RUN node -e "const { chromium } = require('playwright'); console.log('Playwright module loaded')"

# Create directories with proper ownership for non-root user
RUN mkdir -p /cookies /profile /home/node/.cache && chown -R node:node /cookies /profile /home/node/.cache

ENV NODE_OPTIONS=--no-deprecation

# Environment variables (set via docker-compose, Coolify, or docker run -e)
ENV DISCORD_TOKEN=
ENV CLIENT_ID=
ENV ADMIN_TOKEN=
ENV ADMIN_ALLOWED_ORIGINS=
ENV COOKIE_DIR=/cookies
ENV BROWSER_PROFILE=/profile
ENV COOKIE_REFRESH_INTERVAL_MS=43200000
ENV YOUTUBE_COOKIES=
ENV COOKIE_REFRESHER_URL=

USER node
CMD ["npm", "run", "start"]
