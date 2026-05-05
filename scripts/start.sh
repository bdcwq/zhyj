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
  echo "Usage: $0 [--all|--web|--mini-program|--infra]"
  echo ""
  echo "  --all           Start infrastructure + web + mini-program (default)"
  echo "  --web           Start infrastructure + Next.js web app"
  echo "  --mini-program  Start infrastructure + mini-program dev server"
  echo "  --infra         Start only Docker infrastructure (Postgres + Redis)"
  exit 0
}

case "$MODE" in
  --help|-h) usage ;;
  --all|--web|--mini-program|--infra) ;;
  *) error "Unknown option: $MODE. Use --help for usage." ;;
esac

# ── Start Docker infrastructure ───────────────────────────────────
start_infra() {
  info "Starting Docker services (PostgreSQL, Redis)..."
  docker compose up -d db redis

  info "Waiting for services to be healthy..."
  for i in $(seq 1 30); do
    if docker compose exec db pg_isready -U zhyj -d zhyj &>/dev/null && \
       docker compose exec redis redis-cli ping &>/dev/null; then
      info "Infrastructure is ready."
      return 0
    fi
    sleep 1
  done
  error "Timed out waiting for infrastructure to become healthy"
}

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
start_infra

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
  --infra)
    # already started above
    ;;
esac

echo ""
info "All requested services are running."
info "Use ./scripts/stop.sh to stop them."
echo ""

# Keep script alive to forward signals to background processes
wait
