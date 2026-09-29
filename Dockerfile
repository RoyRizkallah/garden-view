# Garden View: one image that serves the website and the API from the same origin.
#   docker compose up -d --build        (see DEPLOY.md)

# ---------- 1. website ----------
FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# The films are stored with Git LFS: a clone without `git lfs pull` has 130-byte pointer files
# instead of videos. Refuse to build a site with broken films.
RUN for f in public/media/*.mp4; do \
      if head -c 40 "$f" | grep -q "git-lfs"; then \
        echo "ERROR: $f is a Git LFS pointer. Run 'git lfs install && git lfs pull' before building."; exit 1; \
      fi; \
    done
# the API lives on the same origin under /api
ARG VITE_GOOGLE_MAPS_API_KEY=""
ENV VITE_API_URL=/api \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
RUN npm run build

# ---------- 2. server ----------
FROM node:22-bookworm-slim AS server
WORKDIR /build/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/ ./
# prisma.config.ts reads DATABASE_URL; generating the client needs no real database
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate && npm run build

# ---------- 3. runtime ----------
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    WEB_DIST=/app/web \
    UPLOADS_DIR=/app/uploads
WORKDIR /app/server
# the server with its dependencies: dev tools are kept on purpose, since `prisma migrate deploy`
# runs at start-up and `npm run create-admin` (tsx) is run inside the container
COPY --from=server --chown=node:node /build/server ./
COPY --from=web --chown=node:node /build/web/dist /app/web
COPY --chmod=755 deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# belt and braces: a checkout with Windows line endings must still start
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
