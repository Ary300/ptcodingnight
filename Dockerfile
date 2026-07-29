# Two targets: `web` (Next.js) and `worker` (judge).
#
# The worker image ships the Docker CLI because it spawns one ephemeral sibling container
# per submission on the host daemon. It never executes untrusted code in its own process
# space — see docs/PRD.md §7 and the isolation flags in CLAUDE.md.

# --- deps ------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build -----------------------------------------------------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma 7 reads the URL from prisma.config.ts at runtime; a placeholder is enough to
# generate the client at build time.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate && npm run build

# --- web -------------------------------------------------------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]

# --- worker ----------------------------------------------------------------
FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
# docker-cli only — the worker issues `docker run` against the mounted host socket.
RUN apt-get update \
 && apt-get install -y --no-install-recommends docker.io ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/lib ./lib
COPY --from=build /app/worker ./worker
CMD ["npm", "run", "worker"]
