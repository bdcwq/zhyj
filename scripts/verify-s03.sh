#!/usr/bin/env bash
# verify-s03.sh — Structural verification for S03 (Moxibustion Appointment System)
# Usage: bash scripts/verify-s03.sh

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

echo "=== S03 Structural Verification ==="
echo ""

# ── Shared package: schemas ──
echo "── Shared Schemas ──"

check "createAppointmentSchema exported" \
  grep -q "createAppointmentSchema" packages/shared/src/schemas/index.ts

check "updateAppointmentSchema exported" \
  grep -q "updateAppointmentSchema" packages/shared/src/schemas/index.ts

check "appointmentListQuerySchema exported" \
  grep -q "appointmentListQuerySchema" packages/shared/src/schemas/index.ts

check "availabilityQuerySchema exported" \
  grep -q "availabilityQuerySchema" packages/shared/src/schemas/index.ts

echo ""

# ── Shared package: constants ──
echo "── Shared Constants ──"

check "APPOINTMENT_ERRORS exported" \
  grep -q "APPOINTMENT_ERRORS" packages/shared/src/constants/index.ts

echo ""

# ── Business rule engine ──
echo "── Business Rule Engine ──"

check "appointment-rules.ts exists" \
  test -f apps/web/src/lib/appointment-rules.ts

check "isBookingAllowed exported" \
  grep -q "isBookingAllowed" apps/web/src/lib/appointment-rules.ts

check "checkResidentExists exported" \
  grep -q "checkResidentExists" apps/web/src/lib/appointment-rules.ts

check "checkResidentMonitored exported" \
  grep -q "checkResidentMonitored" apps/web/src/lib/appointment-rules.ts

check "check15DayLimit exported" \
  grep -q "check15DayLimit" apps/web/src/lib/appointment-rules.ts

check "checkMachineAvailability exported" \
  grep -q "checkMachineAvailability" apps/web/src/lib/appointment-rules.ts

echo ""

# ── API endpoints ──
echo "── API Endpoints ──"

check "appointments/route.ts exists" \
  test -f apps/web/src/app/api/v1/appointments/route.ts

check "appointments/[id]/route.ts exists" \
  test -f "apps/web/src/app/api/v1/appointments/[id]/route.ts"

check "appointments/my/route.ts exists" \
  test -f apps/web/src/app/api/v1/appointments/my/route.ts

check "rooms/route.ts exists" \
  test -f apps/web/src/app/api/v1/rooms/route.ts

check "rooms/[id]/machines/route.ts exists" \
  test -f "apps/web/src/app/api/v1/rooms/[id]/machines/route.ts"

check "rooms/availability/route.ts exists" \
  test -f apps/web/src/app/api/v1/rooms/availability/route.ts

echo ""

# ── Web dashboard ──
echo "── Web Dashboard ──"

check "appointments page exists" \
  test -f apps/web/src/app/\(dashboard\)/appointments/page.tsx

check "nav link to /appointments" \
  grep -q 'href="/appointments"' apps/web/src/app/\(dashboard\)/layout.tsx

echo ""

# ── Mini Program ──
echo "── Mini Program ──"

check "appointments page exists" \
  test -f apps/mini-program/src/pages/appointments/appointments.vue

check "appointments registered in pages.json" \
  grep -q "appointments/appointments" apps/mini-program/src/pages.json

check "home page wired to appointments" \
  grep -q "goToAppointments" apps/mini-program/src/pages/index/index.vue

echo ""

# ── Tests ──
echo "── Tests ──"

check "appointment test file exists" \
  test -f apps/web/src/__tests__/appointments.test.ts

echo ""

# ── Verify script itself ──
echo "── Meta ──"

check "verify-s03.sh exists" \
  test -f scripts/verify-s03.sh

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
