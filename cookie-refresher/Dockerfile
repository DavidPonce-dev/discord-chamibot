FROM node:22-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
  # Playwright dependencies
  wget \
  gnupg \
  xvfb \
  x11vnc \
  novnc \
  websockify \
  # Chromium dependencies
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
  fonts-liberation \
  libappindicator3-1 \
  xdg-utils \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install --production

# Install Playwright and Chromium
RUN npx playwright install chromium \
  && npx playwright install-deps chromium

COPY server.js ./

# Create directories for cookies and browser profile
RUN mkdir -p /cookies /profile

EXPOSE 3001 6080

CMD ["node", "server.js"]
