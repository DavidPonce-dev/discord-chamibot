FROM node:22-slim

RUN apt-get update && apt-get install -y \
  ffmpeg \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

CMD ["npm", "run", "dev"]