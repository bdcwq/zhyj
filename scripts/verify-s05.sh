#!/usr/bin/env bash
# verify-s05.sh — Structural verification for S05 (Robot Session Management)
# Usage: bash scripts/verify-s05.sh

set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

check() {
  local desc="$1"
  TOTAL=$((TOTAL + 1))
  shift
  if "$@"; then
    echo "  ✅ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== S05 Structural Verification ==="
echo ""

# ── Shared package: constants ──
echo "── Shared Constants ──"

check "ROBOT_SESSION_ERRORS in shared constants" \
  grep -q "ROBOT_SESSION_ERRORS" packages/shared/src/constants/index.ts

check "ROBOT_SESSION_ERRORS has 6 codes" \
  bash -c 'count=$(grep -c "ROBOT_" packages/shared/src/constants/index.ts); [ "$count" -ge 6 ]'

check "ROBOT_001 in shared constants" \
  grep -q "ROBOT_001" packages/shared/src/constants/index.ts

check "RobotSessionErrorCode type exported" \
  grep -q "RobotSessionErrorCode" packages/shared/src/constants/index.ts

echo ""

# ── Shared package: schemas ──
echo "── Shared Schemas ──"

check "createRobotSessionSchema in shared schemas" \
  grep -q "createRobotSessionSchema" packages/shared/src/schemas/index.ts

check "updateRobotSessionSchema in shared schemas" \
  grep -q "updateRobotSessionSchema" packages/shared/src/schemas/index.ts

check "robotSessionListQuerySchema in shared schemas" \
  grep -q "robotSessionListQuerySchema" packages/shared/src/schemas/index.ts

echo ""

# ── Robot rules ──
echo "── Robot Rules ──"

check "robot-rules.ts exists" \
  test -f apps/web/src/lib/robot-rules.ts

check "canStartSession exported" \
  grep -q "canStartSession" apps/web/src/lib/robot-rules.ts

check "canStopSession exported" \
  grep -q "canStopSession" apps/web/src/lib/robot-rules.ts

check "getSessionForAppointment exported" \
  grep -q "getSessionForAppointment" apps/web/src/lib/robot-rules.ts

echo ""

# ── Mock adapter ──
echo "── Mock Adapter ──"

check "mock-robot-adapter.ts exists" \
  test -f apps/web/src/lib/mock-robot-adapter.ts

check "startSession exported" \
  grep -q "startSession" apps/web/src/lib/mock-robot-adapter.ts

echo ""

# ── Robot routines ──
echo "── Robot Routines ──"

check "robot-routines.ts exists" \
  test -f apps/web/src/lib/robot-routines.ts

echo ""

# ── API endpoints ──
echo "── API Endpoints ──"

check "robot-sessions POST+GET route exists" \
  test -f "apps/web/src/app/api/v1/robot-sessions/route.ts"

check "robot-sessions PUT route exists" \
  test -f "apps/web/src/app/api/v1/robot-sessions/[id]/route.ts"

check "robot-sessions routines route exists" \
  test -f "apps/web/src/app/api/v1/robot-sessions/routines/route.ts"

check "ROBOT_SESSION_ERRORS imported in API" \
  grep -rq "ROBOT_SESSION_ERRORS" apps/web/src/app/api/v1/robot-sessions/

echo ""

# ── Web dashboard ──
echo "── Web Dashboard ──"

check "robot-sessions page exists" \
  test -f "apps/web/src/app/(dashboard)/robot-sessions/page.tsx"

check "机器人管理 nav link" \
  grep -q "机器人管理" apps/web/src/app/\(dashboard\)/layout.tsx

echo ""

# ── Mini Program ──
echo "── Mini Program ──"

check "in_progress in Mini Program STATUS_LABELS" \
  grep -q "in_progress.*进行中" apps/mini-program/src/pages/appointments/appointments.vue

echo ""

# ── Meta ──
echo "── Meta ──"

check "verify-s05.sh exists" \
  test -f scripts/verify-s05.sh

echo ""

# ── Summary ──
echo "=== Results: $PASS / $TOTAL passed ==="
if [ "$FAIL" -gt 0 ]; then
  echo "⚠️  $FAIL check(s) FAILED"
  exit 1
else
  echo "✅ All checks passed"
  exit 0
fi
