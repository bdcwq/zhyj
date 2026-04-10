#!/usr/bin/env bash
#
# S01 Integration Verification Script
# Validates that all foundation components are in place for Milestone M001 / Slice S01.
#
set -euo pipefail

PASS=0
FAIL=0
WARNINGS=""

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
echo " S01 Integration Verification"
echo "============================================"
echo ""

# ── 1. Monorepo structure ──
echo "▸ Monorepo structure"
check "Root package.json exists"            test -f package.json
check "pnpm-workspace.yaml exists"          test -f pnpm-workspace.yaml
check "turbo.json exists"                   test -f turbo.json
echo ""

# ── 2. Database schema ──
echo "▸ Database schema"
check_cmd "Prisma schema validates"         "pnpm --filter @zhyj/db exec prisma validate"
check "SQLite dev.db exists"                test -f packages/db/prisma/dev.db
check_cmd "Prisma client generated"         "test -d node_modules/.pnpm/@prisma+client@6.19.3_prisma@6.19.3_typescript@5.9.3__typescript@5.9.3/node_modules/@prisma/client"
echo ""

# ── 3. Shared package ──
echo "▸ Shared package"
check "packages/shared/src/index.ts exists" test -f packages/shared/src/index.ts
check "Shared types exported"               test -f packages/shared/src/types/index.ts
check "Shared schemas exported"             test -f packages/shared/src/schemas/index.ts
check "Shared constants exported"           test -f packages/shared/src/constants/index.ts
echo ""

# ── 4. Staff web dashboard ──
echo "▸ Staff web dashboard (@zhyj/web)"
check "apps/web/src directory exists"       test -d apps/web/src
check "Web app package.json exists"         test -f apps/web/package.json
check "Auth middleware exists"              test -f apps/web/src/middleware.ts
check "Auth utilities exist"                test -f apps/web/src/lib/auth.ts
check "Prisma client singleton exists"      test -f apps/web/src/lib/db.ts
check "Staff login page exists"             test -f "apps/web/src/app/(auth)/login/page.tsx"
check "Staff login API exists"              test -f apps/web/src/app/api/v1/auth/staff/login/route.ts
check "SMS code API exists"                 test -f apps/web/src/app/api/v1/auth/staff/sms-code/route.ts
check "WeChat login API exists"             test -f apps/web/src/app/api/v1/auth/resident/wechat/route.ts
echo ""

# ── 5. Mini Program ──
echo "▸ Mini Program (@zhyj/mini-program)"
check "Mini program package.json exists"    test -f apps/mini-program/package.json
check "pages.json exists"                   test -f apps/mini-program/src/pages.json
check "manifest.json exists"                test -f apps/mini-program/src/manifest.json
check "Request wrapper exists"              test -f apps/mini-program/src/utils/request.ts
check "Auth utilities exist"                test -f apps/mini-program/src/utils/auth.ts
check "Pinia auth store exists"             test -f apps/mini-program/src/stores/auth.ts
check "Login page exists"                   test -f apps/mini-program/src/pages/login/login.vue
check "Index (home) page exists"            test -f apps/mini-program/src/pages/index/index.vue
check "Profile page exists"                 test -f apps/mini-program/src/pages/profile/profile.vue
check "Tab bar icons exist"                 test -f apps/mini-program/src/static/tabBar/home.png
echo ""

# ── 6. Seed data ──
echo "▸ Seed data"
STORE_COUNT=$(sqlite3 packages/db/prisma/dev.db "SELECT COUNT(*) FROM Store" 2>/dev/null || echo "0")
if [ "$STORE_COUNT" -ge 1 ]; then
  echo "  ✅ Store data present ($STORE_COUNT rows)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Store data missing (expected >= 1, got $STORE_COUNT)"
  FAIL=$((FAIL + 1))
fi

ROOM_COUNT=$(sqlite3 packages/db/prisma/dev.db "SELECT COUNT(*) FROM Room" 2>/dev/null || echo "0")
if [ "$ROOM_COUNT" -ge 1 ]; then
  echo "  ✅ Room data present ($ROOM_COUNT rows)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Room data missing (expected >= 1, got $ROOM_COUNT)"
  FAIL=$((FAIL + 1))
fi

MACHINE_COUNT=$(sqlite3 packages/db/prisma/dev.db "SELECT COUNT(*) FROM Machine" 2>/dev/null || echo "0")
if [ "$MACHINE_COUNT" -ge 1 ]; then
  echo "  ✅ Machine data present ($MACHINE_COUNT rows)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Machine data missing (expected >= 1, got $MACHINE_COUNT)"
  FAIL=$((FAIL + 1))
fi

STAFF_COUNT=$(sqlite3 packages/db/prisma/dev.db "SELECT COUNT(*) FROM Staff" 2>/dev/null || echo "0")
if [ "$STAFF_COUNT" -ge 2 ]; then
  echo "  ✅ Staff data present ($STAFF_COUNT rows)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Staff data missing (expected >= 2, got $STAFF_COUNT)"
  FAIL=$((FAIL + 1))
fi

RESIDENT_COUNT=$(sqlite3 packages/db/prisma/dev.db "SELECT COUNT(*) FROM Resident" 2>/dev/null || echo "0")
if [ "$RESIDENT_COUNT" -ge 10 ]; then
  echo "  ✅ Resident data present ($RESIDENT_COUNT rows)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Resident data missing (expected >= 10, got $RESIDENT_COUNT)"
  FAIL=$((FAIL + 1))
fi
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
echo "🎉 All S01 structural checks passed!"
echo ""
echo "Manual verification steps (require running dev server):"
echo "  1. pnpm --filter @zhyj/web dev"
echo "  2. curl -X POST http://localhost:3000/api/v1/auth/staff/login -H 'Content-Type: application/json' -d '{\"method\":\"password\",\"username\":\"admin\",\"password\":\"admin123\"}'"
echo "  3. curl -X POST http://localhost:3000/api/v1/auth/staff/login -H 'Content-Type: application/json' -d '{\"method\":\"sms\",\"phone\":\"13900000001\",\"code\":\"123456\"}'"
echo "  4. curl -X POST http://localhost:3000/api/v1/auth/resident/wechat -H 'Content-Type: application/json' -d '{\"code\":\"test_code_1234\"}'"
echo "  5. Open http://localhost:3000/login in browser to test staff login UI"
echo ""

exit 0
