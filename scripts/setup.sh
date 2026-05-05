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

# ── Push database schema (SQLite) ─────────────────────────────────
info "Pushing database schema (SQLite)..."
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
echo "  ./scripts/dev.sh                        # Start web + mini-program"
echo "  ./scripts/dev.sh --web                  # Start web only"
echo "  ./scripts/dev.sh --mini-program         # Start mini-program only"
echo ""
