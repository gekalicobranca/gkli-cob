FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    WHATSAPP_WEB_RUNTIME=railway \
    WHATSAPP_WEB_PROCESS_MESSAGES=false \
    PUPPETEER_CACHE_DIR=/opt/puppeteer \
    WHATSAPP_WEB_CHROME_PATH=/usr/local/bin/gkli-chrome \
    TZ=America/Sao_Paulo
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium dumb-init util-linux ca-certificates fonts-liberation unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/whatsapp-web/package.json scripts/whatsapp-web/package-lock.json ./scripts/whatsapp-web/
RUN npm ci --omit=dev --ignore-scripts --prefix scripts/whatsapp-web --no-audit --no-fund
RUN cd scripts/whatsapp-web && ./node_modules/.bin/puppeteer browsers install chrome-headless-shell@153.0.8010.36 \
    && ln -s /opt/puppeteer/chrome-headless-shell/linux-153.0.8010.36/chrome-headless-shell-linux64/chrome-headless-shell /usr/local/bin/gkli-chrome
COPY scripts/whatsapp-web/ ./scripts/whatsapp-web/
COPY scripts/worker-cadence.mjs ./scripts/worker-cadence.mjs
# /data must be a mounted Railway volume; it is deliberately not created here.
CMD ["dumb-init", "--", "flock", "--nonblock", "/data/whatsapp.lock", "node", "scripts/whatsapp-web/railway-supervisor.mjs"]
