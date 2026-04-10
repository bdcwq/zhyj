#!/usr/bin/env bash
# verify-s04.sh — Structural verification for S04 (Verification & No-Show Tracking)
# Usage: bash scripts/verify-s04.sh

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

echo "=== S04 Structural Verification ==="
echo ""

# ── Shared package: constants ──
echo "── Shared Constants ──"

check "VERIFIED in shared constants" \
  grep -q "VERIFIED" packages/shared/src/constants/index.ts

check "VERIFICATION_ERRORS in shared constants" \
  grep -q "VERIFICATION_ERRORS" packages/shared/src/constants/index.ts

check "VERIFICATION_ERRORS has 5 codes" \
  bash -c 'count=$(grep -c "VERIFICATION_" packages/shared/src/constants/index.ts); [ "$count" -ge 5 ]'

check "NO_SHOW_LIMIT in shared constants" \
  grep -q "NO_SHOW_LIMIT" packages/shared/src/constants/index.ts

echo ""

# ── Verification rules ──
echo "── Verification Rules ──"

check "verification-rules.ts exists" \
  test -f apps/web/src/lib/verification-rules.ts

check "canVerifyAppointment exported" \
  grep -q "canVerifyAppointment" apps/web/src/lib/verification-rules.ts

check "markNoShow exported" \
  grep -q "markNoShow" apps/web/src/lib/verification-rules.ts

check "countMonthlyNoShows exported" \
  grep -q "countMonthlyNoShows" apps/web/src/lib/verification-rules.ts

check "checkNoShowPenalty exported" \
  grep -q "checkNoShowPenalty" apps/web/src/lib/verification-rules.ts

check "getBookingStatus exported" \
  grep -q "getBookingStatus" apps/web/src/lib/verification-rules.ts

check "checkNoShowPenalty imported in appointment-rules.ts" \
  grep -q "checkNoShowPenalty" apps/web/src/lib/appointment-rules.ts

echo ""

# ── API endpoints ──
echo "── API Endpoints ──"

check "verify route.ts exists" \
  test -f "apps/web/src/app/api/v1/appointments/[id]/verify/route.ts"

check "no-show route.ts exists" \
  test -f "apps/web/src/app/api/v1/appointments/[id]/no-show/route.ts"

check "booking-status route.ts exists" \
  test -f "apps/web/src/app/api/v1/residents/[residentId]/booking-status/route.ts"

echo ""

# ── Web dashboard ──
echo "── Web Dashboard ──"

check "verification page exists" \
  test -f apps/web/src/app/\(dashboard\)/verification/page.tsx

check "核销管理 nav link in layout" \
  grep -q "核销管理" apps/web/src/app/\(dashboard\)/layout.tsx

echo ""

# ── Mini Program ──
echo "── Mini Program ──"

check "verified in STATUS_LABELS" \
  grep -q "verified.*已核销" apps/mini-program/src/pages/appointments/appointments.vue

check "verified in STATUS_BADGE_CLASSES" \
  grep -q "verified.*status-badge--green" apps/mini-program/src/pages/appointments/appointments.vue

echo ""

# ── Meta ──
echo "── Meta ──"

check "verify-s04.sh exists" \
  test -f scripts/verify-s04.sh

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
