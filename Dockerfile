# syntax=docker/dockerfile:1
#
# Multi-stage build (architecture.md §7, ADR-010): every stage is
# node:22-slim (Debian) — never Alpine/musl — so better-sqlite3's
# prebuilt native binding (or its node-gyp fallback built in `deps`) is
# guaranteed ABI-compatible with the runner. Do not change any stage's
# base image independently of the others.

# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
RUN corepack enable     # package.json MUST carry a pinned "packageManager": "pnpm@x.y.z" field (ADR-008)
# Build tooling for better-sqlite3's node-gyp fallback if no prebuilt binary matches the platform:
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
# pnpm-workspace.yaml (onlyBuiltDependencies) MUST be copied before `pnpm install`,
# otherwise pnpm skips better-sqlite3's native build step entirely.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app
RUN corepack enable     # required in EVERY stage that invokes pnpm — fresh base image each stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build          # next.config.ts has output: 'standalone' + serverExternalPackages: ['better-sqlite3']

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/dionysus.db
ENV PORT=3000
ENV NEAR_MATCH_DEFAULT_THRESHOLD=3
# Docker always injects a container HOSTNAME env var (the container ID),
# and Next's standalone server.js does `process.env.HOSTNAME || '0.0.0.0'`
# — without this override the server binds only to the container's
# bridge-network IP, never to loopback, so the in-container HEALTHCHECK
# (which fetches http://localhost:3000) fails with ECONNREFUSED even
# though the published port still works from the host. Force the
# documented 0.0.0.0 bind explicitly (discovered via real container
# execution, not in the architecture §7 snippet verbatim).
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/data/seed/seed-data.json ./data/seed/seed-data.json
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
