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
  echo "  --all           Start web + mini-program in background (default)"
  echo "  --web           Start Next.js web app in background"
  echo "  --mini-program  Start mini-program dev server in background"
  exit 0
}

case "$MODE" in
  --help|-h) usage ;;
  --all|--web|--mini-program) ;;
  *) error "Unknown option: $MODE. Use --help for usage." ;;
esac

# ── Start web app ─────────────────────────────────────────────────
start_web() {
  info "Starting Next.js web app..."
  pnpm --filter @zhyj/web dev &
  WEB_PID=$!
  echo "$WEB_PID" > "$ROOT/.web.pid"
  info "Web app started (PID: $WEB_PID) on ${CYAN}http://localhost:3000${NC}"
}

# ── Start mini-program ────────────────────────────────────────────
start_mini_program() {
  info "Starting mini-program dev server..."
  pnpm --filter @zhyj/mini-program dev:mp-weixin &
  MP_PID=$!
  echo "$MP_PID" > "$ROOT/.mini-program.pid"
  info "Mini-program dev server started (PID: $MP_PID)"
}

# ── Run ───────────────────────────────────────────────────────────
case "$MODE" in
  --all)
    start_web
    start_mini_program
    ;;
  --web)
    start_web
    ;;
  --mini-program)
    start_mini_program
    ;;
esac

echo ""
info "All requested services are running."
info "Use ./scripts/stop.sh to stop them."
echo ""

wait
