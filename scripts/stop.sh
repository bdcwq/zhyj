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

MODE="${1:---all}"

usage() {
  echo "Usage: $0 [--all|--web|--mini-program|--infra]"
  echo ""
  echo "  --all           Stop everything (default)"
  echo "  --web           Stop only the Next.js web app"
  echo "  --mini-program  Stop only the mini-program dev server"
  echo "  --infra         Stop only Docker infrastructure"
  exit 0
}

case "$MODE" in
  --help|-h) usage ;;
  --all|--web|--mini-program|--infra) ;;
  *) echo -e "${RED}[ERROR]${NC} Unknown option: $MODE. Use --help for usage." >&2; exit 1 ;;
esac

# ── Stop a process by PID file ────────────────────────────────────
stop_by_pid() {
  local pidfile="$1"
  local name="$2"
  if [ -f "$pidfile" ]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      info "Stopping $name (PID: $pid)..."
      kill "$pid" 2>/dev/null || true
      # Also kill any child processes
      pkill -P "$pid" 2>/dev/null || true
    else
      warn "$name (PID: $pid) is not running"
    fi
    rm -f "$pidfile"
  else
    warn "$name PID file not found (may not be running)"
  fi
}

# ── Stop Docker infrastructure ────────────────────────────────────
stop_infra() {
  info "Stopping Docker services..."
  docker compose down
  info "Docker services stopped."
}

# ── Run ───────────────────────────────────────────────────────────
case "$MODE" in
  --all)
    stop_by_pid "$ROOT/.web.pid" "Web app"
    stop_by_pid "$ROOT/.mini-program.pid" "Mini-program"
    stop_infra
    ;;
  --web)
    stop_by_pid "$ROOT/.web.pid" "Web app"
    ;;
  --mini-program)
    stop_by_pid "$ROOT/.mini-program.pid" "Mini-program"
    ;;
  --infra)
    stop_infra
    ;;
esac

echo ""
info "Done."
