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
# OpenSSL: Prisma probes for it at startup and warns loudly without it. The driver-adapter
# path still works, but a warning on every seed and migrate is noise an operator has to learn
# to ignore, and "ignore that error" is a bad habit to teach on a deployment runbook.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/next.config.ts ./next.config.ts
# `next start` reads the config; without it a setting like serverExternalPackages silently
# differs between the build and the running server.

# The rest is what SEEDING needs, and docs/DEPLOY.md §8.4 tells the operator to run both seed
# commands in THIS container. Without these they fail on a missing file:
#   npm run db:seed          -> data/problems_seed.csv, lib/, tsconfig.json
#   npx tsx scripts/seed-demo.ts -> scripts/, lib/, content/, tsconfig.json
#
# `content` is also read at RUNTIME by the web process: TEST_DATA_ROOT resolves sample inputs
# for the problem page, and buildJudgeJob resolves absolute test paths before queueing a job.
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/data ./data
COPY --from=build /app/content ./content
USER nextjs
EXPOSE 3000
CMD ["npm", "run", "start"]

# --- worker ----------------------------------------------------------------
FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
# docker-cli only — the worker issues `docker run` against the mounted host socket.
#
# From DOCKER'S repository, not Debian's `docker.io`. Debian bookworm ships 20.10.24, whose
# client speaks API 1.41, and Docker Engine 25+ refuses it outright:
#
#   Error response from daemon: client version 1.41 is too old.
#   Minimum supported API version is 1.44
#
# The worker reports that as "Docker daemon is not reachable" and restart-loops, so a composed
# deployment cannot judge a single submission. Measured against the daemon this repo builds
# against; it would fail identically on a current droplet.
#
# `docker-ce-cli` only. The daemon is the host's — this image must never run one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && install -m 0755 -d /etc/apt/keyrings \
 && curl -fsSL https://download.docker.com/linux/debian/gpg \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
 && chmod a+r /etc/apt/keyrings/docker.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends docker-ce-cli openssl \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/lib ./lib
COPY --from=build /app/worker ./worker
# The authored test data. Baked into the image rather than bind-mounted: it is versioned with
# the code that judges against it, and a container that cannot find its test cases reports IE
# on a student's submission rather than failing at deploy time.
COPY --from=build /app/content ./content
CMD ["npm", "run", "worker"]
