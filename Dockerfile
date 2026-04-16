# ── Stage 1: deps ────────────────────────────────────────────────────────
# Install production dependencies only for the web app and its workspace
# dependencies. Dev dependencies are excluded to minimize image size.
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# pnpm needs the full workspace context to resolve workspace:* links
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/redis/package.json packages/redis/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: builder ────────────────────────────────────────────────────
# Generate Prisma client, install all deps (including dev), then build the
# Next.js app in standalone mode. The standalone output produces a minimal
# server that includes only the required node_modules.
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json packages/db/
COPY packages/redis/package.json packages/redis/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

# Install all dependencies (including dev) for building
RUN pnpm install --frozen-lockfile

# Copy source files for all workspace packages
COPY packages/db/ packages/db/
COPY packages/redis/ packages/redis/
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
COPY turbo.json ./

# Generate Prisma client (needed at build time for type generation)
# Use pnpm exec to ensure the locked version (6.x) is used, not latest via npx
RUN pnpm --filter @zhyj/db exec prisma generate --schema=prisma/schema.prisma

# Build the Next.js app in standalone mode
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @zhyj/web build

# ── Stage 3: runner ─────────────────────────────────────────────────────
# Minimal production image with only the standalone output and static assets.
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone server output from the builder (preserves monorepo structure)
COPY --from=builder /app/apps/web/.next/standalone /app

# Copy static assets (public directory)
RUN mkdir -p /app/apps/web/public

# Copy Prisma engine and client for runtime queries
# Prisma generates into packages/db/node_modules/.prisma in pnpm workspace
COPY --from=builder /app/packages/db/node_modules/.prisma /app/apps/web/node_modules/.prisma
COPY --from=builder /app/packages/db/node_modules/@prisma /app/apps/web/node_modules/@prisma
COPY --from=builder /app/packages/db/prisma /app/packages/db/prisma

# Ensure the nextjs user owns the app directory
RUN chown -R nextjs:nodejs /app

WORKDIR /app/apps/web

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

CMD ["node", "server.js"]
