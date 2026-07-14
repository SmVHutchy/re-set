# --- Build stage: SPA bauen ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Runtime stage: ein Node-Server liefert SPA + API + Import-Ausgabe ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV MUSIC_PATH=/music

# ffmpeg treibt den optionalen Deep-Scan (LUFS / True-Peak).
RUN apk add --no-cache ffmpeg

# Nur Runtime-Deps (express + music-metadata); Vite/TS bleiben im Build-Stage.
COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts
COPY public ./public

EXPOSE 3001
CMD ["node", "scripts/server.mjs"]
