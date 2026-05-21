# Stage 1: Build
FROM node:22-bookworm AS builder

WORKDIR /app

COPY package*.json ./
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# Stage 2: Production
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y \
  ffmpeg \
  curl \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Pre-install yt-dlp so youtube-dl-exec doesn't download it at runtime
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod +x /usr/local/bin/yt-dlp

ENV YOUTUBE_DL_DIR=/usr/local/bin
ENV YOUTUBE_DL_SKIP_DOWNLOAD=1

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["npm", "run", "start"]
