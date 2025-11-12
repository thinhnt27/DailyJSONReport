FROM node:20-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

# ---------- Deps ----------
FROM base AS deps
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --no-frozen-lockfile

# ---------- Build ----------
FROM deps AS build
COPY . .
RUN pnpm prisma generate
RUN pnpm build

# ---------- Prod deps ----------
FROM deps AS prod-deps
RUN pnpm prune --prod

# ---------- Runtime ----------
FROM node:20-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY package.json ./

COPY --from=build /app/src/data/analyses ./src/data/analyses

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/event-detections/health || exit 1

CMD ["node", "dist/main.js"]