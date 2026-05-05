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
  echo "  --all           Start infra + web + mini-program (default)"
  echo "  --web           Start infra + Next.js dev server"
  echo "  --mini-program  Start infra + mini-program dev server"
  echo ""
  echo "Press Ctrl+C to stop all services."
  exit 0
}

case "$MODE" in
  --help|-h) usage ;;
  --all|--web|--mini-program) ;;
  *) error "Unknown option: $MODE. Use --help for usage." ;;
esac

# ── Ensure Docker infrastructure is running ───────────────────────
ensure_infra() {
  local need_start=false

  if ! docker compose ps db --format '{{.State}}' 2>/dev/null | grep -q 'running'; then
    need_start=true
  fi
  if ! docker compose ps redis --format '{{.State}}' 2>/dev/null | grep -q 'running'; then
    need_start=true
  fi

  if [ "$need_start" = true ]; then
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
  else
    info "Docker services already running."
  fi
}

# ── Cleanup on exit ───────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down dev servers..."
  # Kill the entire process group (turbo spawns child processes)
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── Run ───────────────────────────────────────────────────────────
ensure_infra

case "$MODE" in
  --all)
    info "Starting web + mini-program dev servers (turbo)..."
    pnpm dev
    ;;
  --web)
    info "Starting Next.js dev server..."
    pnpm --filter @zhyj/web dev
    ;;
  --mini-program)
    info "Starting mini-program dev server..."
    pnpm --filter @zhyj/mini-program dev:mp-weixin
    ;;
esac
