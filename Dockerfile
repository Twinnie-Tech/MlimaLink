# One image for every backend service; docker-compose.prod.yml picks which one each
# container runs. The services load their packages from node_modules at runtime, so the
# whole workspace stays in the image.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
ENV NX_DAEMON=false NX_NO_CLOUD=true

COPY . .
# tfjs-node has no prebuilt binary for some platforms (e.g. ARM); it's optional, and the
# recommendation service falls back to the JavaScript backend.
RUN npm ci
RUN npx prisma generate
RUN npx nx run-many -t build --parallel=2 \
  -p api @org/api-gateway auth-service kafka-service chatting-service logger-service recommendation-service

ENV NODE_ENV=production
CMD ["node", "apps/api-gateway/dist/main.js"]
