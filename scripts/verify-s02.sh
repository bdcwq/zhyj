#!/usr/bin/env bash
#
# S02 Integration Verification Script
# Validates that all constitution monitoring components are in place for Milestone M001 / Slice S02.
#
set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  shift
  if "$@"; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label"
    FAIL=$((FAIL + 1))
  fi
}

check_cmd() {
  local label="$1"
  local cmd="$2"
  if eval "$cmd" > /dev/null 2>&1; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label"
    FAIL=$((FAIL + 1))
  fi
}

echo "============================================"
echo " S02 Integration Verification"
echo " Constitution Monitoring"
echo "============================================"
echo ""

# ── 1. Shared package ──
echo "▸ Shared package (@zhyj/shared)"
check_cmd "Shared package builds"                    "pnpm --filter @zhyj/shared build"
check "Constitution types exported"                  grep -q "CONSTITUTION_TYPES" packages/shared/src/constants/index.ts
check "Monitoring error codes exported"              grep -q "MONITORING_ERRORS" packages/shared/src/constants/index.ts
check "Monitoring schemas exported"                  grep -q "createMonitoringRecordSchema" packages/shared/src/schemas/index.ts
echo ""

# ── 2. API utilities ──
echo "▸ API utilities"
check "API response utility exists"                  test -f apps/web/src/lib/api-response.ts
check "Auth context helper exists"                   grep -q "getAuthContext" apps/web/src/lib/auth.ts
echo ""

# ── 3. API endpoint files ──
echo "▸ API endpoint files"
check "POST/GET /api/v1/monitoring route exists"     test -f apps/web/src/app/api/v1/monitoring/route.ts
check "GET/DELETE /api/v1/monitoring/[id] exists"    test -f "apps/web/src/app/api/v1/monitoring/[id]/route.ts"
check "GET /api/v1/residents/[residentId]/monitoring-history exists" \
                                                       test -f "apps/web/src/app/api/v1/residents/[residentId]/monitoring-history/route.ts"
check "GET /api/v1/residents route exists"           test -f apps/web/src/app/api/v1/residents/route.ts
echo ""

# ── 4. Web dashboard ──
echo "▸ Web dashboard (@zhyj/web)"
check "Dashboard layout exists"                      test -f "apps/web/src/app/(dashboard)/layout.tsx"
check "Dashboard has monitoring navigation"          grep -q "monitoring" "apps/web/src/app/(dashboard)/layout.tsx"
check "Monitoring page exists"                       test -f "apps/web/src/app/(dashboard)/monitoring/page.tsx"
check "recharts dependency installed"                grep -q "recharts" apps/web/package.json
echo ""

# ── 5. Mini Program ──
echo "▸ Mini Program (@zhyj/mini-program)"
check "Monitoring page registered in pages.json"     grep -q "pages/monitoring/monitoring" apps/mini-program/src/pages.json
check "Monitoring page file exists"                  test -f apps/mini-program/src/pages/monitoring/monitoring.vue
check "Home page wired to monitoring"                grep -q "monitoring" apps/mini-program/src/pages/index/index.vue
echo ""

# ── 6. Tests ──
echo "▸ Test suite"
check_cmd "All web tests pass"                       "pnpm --filter @zhyj/web test"
echo ""

# ── 7. Summary ──
echo "============================================"
echo " Results: $PASS passed, $FAIL failed"
echo "============================================"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "⚠️  Some checks failed. See above for details."
  exit 1
fi

echo ""
echo "🎉 All S02 structural checks passed!"
echo ""
echo "Manual verification steps (require running dev server):"
echo "  1. pnpm --filter @zhyj/web dev"
echo "  2. Login as staff (POST /api/v1/auth/staff/login)"
echo "  3. Navigate to /monitoring to test staff recording UI"
echo "  4. POST /api/v1/monitoring to create a record"
echo "  5. GET /api/v1/residents/{id}/monitoring-history for stats"
echo "  6. Open Mini Program to test resident history view"
echo ""

exit 0
