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

# Install Playwright and Chromium
RUN npx playwright install chromium \
  && npx playwright install-deps chromium 2>/dev/null || true

# Verify Chromium binary exists
RUN node -e "const { chromium } = require('playwright'); console.log('Playwright module loaded')"

# Set explicit Playwright browsers path
ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

# Create directories for cookies and browser profile
RUN mkdir -p /cookies /profile

ENV NODE_OPTIONS=--no-deprecation
CMD ["npm", "run", "start"]
