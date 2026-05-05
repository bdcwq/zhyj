#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── Check prerequisites ───────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is not installed. Please install it first."
  fi
}

info "Checking prerequisites..."
check_cmd node
check_cmd pnpm
check_cmd docker

# ── Create .env.local if missing ──────────────────────────────────
if [ ! -f .env.local ]; then
  warn ".env.local not found, copying from .env.example"
  cp .env.example .env.local
fi

# ── Install dependencies ──────────────────────────────────────────
info "Installing pnpm dependencies..."
pnpm install

# ── Generate Prisma client ────────────────────────────────────────
info "Generating Prisma client..."
pnpm --filter @zhyj/db prisma generate

# ── Start Docker services (Postgres + Redis) ──────────────────────
info "Starting Docker services (PostgreSQL, Redis)..."
docker compose up -d db redis

info "Waiting for services to be healthy..."
sleep 3
for i in $(seq 1 30); do
  if docker compose exec db pg_isready -U zhyj -d zhyj &>/dev/null && \
     docker compose exec redis redis-cli ping &>/dev/null; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "Timed out waiting for database/redis to become healthy"
  fi
  sleep 1
done

# ── Push database schema ──────────────────────────────────────────
info "Pushing database schema..."
pnpm --filter @zhyj/db prisma db push --accept-data-loss

# ── Seed database ─────────────────────────────────────────────────
info "Seeding database..."
pnpm --filter @zhyj/db prisma:seed || warn "Seed skipped or failed (may already be seeded)"

# ── Build shared packages ─────────────────────────────────────────
info "Building shared packages..."
pnpm build

echo ""
info "Setup complete! Run the following to start development:"
echo ""
echo "  pnpm dev              # Start web (Next.js) on http://localhost:3000"
echo "  pnpm --filter @zhyj/mini-program dev:mp-weixin   # Start mini-program dev"
echo ""
info "Or use ./scripts/start.sh / ./scripts/stop.sh to manage services."
