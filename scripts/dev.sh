#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

MODE="${1:---all}"

usage() {
  echo "Usage: $0 [--all|--web|--mini-program]"
  echo ""
  echo "  --all           Start web + mini-program (default)"
  echo "  --web           Start Next.js dev server"
  echo "  --mini-program  Start mini-program dev server"
  echo ""
  echo "Press Ctrl+C to stop all services."
  exit 0
}

case "$MODE" in
  --help|-h) usage ;;
  --all|--web|--mini-program) ;;
  *) error "Unknown option: $MODE. Use --help for usage." ;;
esac

# ── Ensure SQLite database exists ─────────────────────────────────
if [ ! -f "packages/db/prisma/dev.db" ]; then
  warn "SQLite database not found. Run ./scripts/setup.sh first."
fi

# ── Cleanup on exit ───────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down dev servers..."
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Run ───────────────────────────────────────────────────────────
case "$MODE" in
  --all)
    info "Starting web + mini-program dev servers..."
    pnpm dev
    ;;
  --web)
    info "Starting Next.js dev server on ${CYAN}http://localhost:3000${NC}..."
    pnpm --filter @zhyj/web dev
    ;;
  --mini-program)
    info "Starting mini-program dev server..."
    pnpm --filter @zhyj/mini-program dev:mp-weixin
    ;;
esac
