FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    WHATSAPP_WEB_RUNTIME=railway \
    WHATSAPP_WEB_PROCESS_MESSAGES=false \
    WHATSAPP_WEB_CHROME_PATH=/usr/bin/chromium \
    TZ=America/Sao_Paulo
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium dumb-init util-linux ca-certificates fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/whatsapp-web/package.json scripts/whatsapp-web/package-lock.json ./scripts/whatsapp-web/
RUN npm ci --omit=dev --ignore-scripts --prefix scripts/whatsapp-web --no-audit --no-fund
COPY scripts/whatsapp-web/ ./scripts/whatsapp-web/
COPY scripts/worker-cadence.mjs ./scripts/worker-cadence.mjs
# /data must be a mounted Railway volume; it is deliberately not created here.
CMD ["dumb-init", "--", "flock", "--nonblock", "/data/whatsapp.lock", "node", "scripts/whatsapp-web/railway-supervisor.mjs"]
