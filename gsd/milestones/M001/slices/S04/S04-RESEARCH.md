# S04: Verification & No-Show Tracking — Research

**Calibration:** Targeted research. This slice applies established patterns (business rule functions, API routes, Next.js pages, uni-app pages) to a new domain (verification + no-show tracking). No unfamiliar technology. The main complexity is the no-show penalty rule engine and its integration with the existing booking rules.

## Summary

S04 adds appointment verification (核销) and no-show tracking with penalty enforcement. The Prisma schema already has the `Verification` model and the `Appointment.noShowCount` field. The `APPOINTMENT_STATUS` constant is missing the `verified` status value — that's a required addition. The existing business rule engine pattern (`isBookingAllowed` with composable `check*` functions) extends naturally with a `checkNoShowPenalty` function. All patterns from S03 are directly reusable.

## Recommendation

Follow the S03 task structure: (T01) shared constants/schemas/rules, (T02) API endpoints, (T03) staff web page, (T04) Mini Program page + verification. The no-show auto-detection (20-min rule) should use a scheduled approach — a cron-like API endpoint that staff triggers or a `GET /api/v1/appointments/no-show-check` endpoint that the frontend can poll. A true background cron is overkill for M001 dev; a manual trigger endpoint is simpler and testable.

## What Exists

### Database Schema (`packages/db/prisma/schema.prisma`)
- **Verification model** already exists: `{ id, appointmentId (unique), verifiedBy, verifiedAt, storeId, createdAt, updatedAt }`
- **Appointment model** has `noShowCount: Int @default(0)` and `status: String @default("booked")`
- **Appointment→Verification** relation: `verification Verification?` (one-to-one)

### Shared Constants (`packages/shared/src/constants/index.ts`)
- `APPOINTMENT_STATUS` has: `BOOKED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW`
- **Missing:** `VERIFIED: "verified"` — must be added
- `APPOINTMENT_ERRORS` has 9 error codes — need to add verification/no-show specific codes
- No `VERIFICATION_ERRORS` constant yet — create one following the existing pattern (AUTH_ERRORS, MONITORING_ERRORS, APPOINTMENT_ERRORS)

### Shared Types (`packages/shared/src/types/index.ts`)
- `Verification` interface already defined
- `Appointment` interface already has `noShowCount: number`

### Shared Schemas (`packages/shared/src/schemas/index.ts`)
- No verification-related schemas exist yet — need: `verifyAppointmentSchema`, `markNoShowSchema`, `bookingStatusQuerySchema`

### Business Rules (`apps/web/src/lib/appointment-rules.ts`)
- `isBookingAllowed()` runs 4 checks sequentially — add `checkNoShowPenalty()` as step 2.5 (after monitoring check, before 15-day limit)
- Pattern: async pure functions accepting `prisma` tx, returning `RuleResult { allowed, reason?, code? }`
- The function accepts `BookingParams` with `residentId` and `storeId` — enough for no-show count query

### API Patterns (`apps/web/src/app/api/v1/appointments/`)
- `[id]/route.ts` — GET (detail with ownership guard), DELETE (cancel with status check)
- `route.ts` — POST (create with rules), GET (list with filters)
- `my/route.ts` — resident-only list
- All use `getAuthContext()`, `errorResponse()`, `successResponse()`, `[appointments]` log prefix
- Ownership guard: if `authContext.residentId`, verify `appointment.residentId` matches

### Web Dashboard Patterns (`apps/web/src/app/(dashboard)/appointments/page.tsx`)
- Client component with `useState`, `useEffect`, `useCallback`
- `fetchWithAuth<T>()` helper with `credentials: "include"`
- Status badges: `STATUS_LABELS` map + `STATUS_COLORS` map → inline `<span>` with Tailwind classes
- Message banner pattern: `{ type: "success" | "error"; text: string }`
- Card-based layout with `Card`, `CardHeader`, `CardContent`, `CardTitle` from shadcn

### Mini Program Patterns (`apps/mini-program/src/pages/appointments/appointments.vue`)
- Vue 3 `<script setup lang="ts">` with Composition API
- `request()` utility from `@/utils/request` — auto-prefixes `/api/v1`, handles auth token
- `useAuthStore()` for resident auth state
- Tab pattern: reactive `currentTab`, sticky `tab-bar`, `::after` active indicator
- Status badge classes: `status-badge--blue/green/orange/gray/red`
- `onShow()` lifecycle hook for data refresh on navigation back

### Auth Pattern (`apps/web/src/lib/auth.ts`)
- `getAuthContext()` returns `{ staffId?, residentId?, role, storeId }`
- Supports cookie-based (web) and Bearer token (Mini Program) auth
- All API routes check `!authContext?.staffId && !authContext?.residentId` for 401

### Test Pattern (`apps/web/src/__tests__/appointments.test.ts`)
- Mock prisma: `createMockPrisma()` with `vi.fn().mockResolvedValue()`
- Schema tests: `safeParse()` with valid/invalid inputs
- Business rule tests: mock return values, assert `allowed`, `code`, `reason`
- 41 tests total (17 schema + 24 rules)

### Dashboard Layout (`apps/web/src/app/(dashboard)/layout.tsx`)
- Navigation links: "体质监测" → `/monitoring`, "预约管理" → `/appointments`
- Need to add "预约核销" → `/verification` link

### Seed Data (`packages/db/prisma/seed.ts`)
- Creates 10 residents, 1-3 monitoring records each
- No appointments or verifications in seed — S04 may want to add sample appointments for demo

## Implementation Landscape

### Files to Create
| File | Purpose |
|------|---------|
| `apps/web/src/lib/verification-rules.ts` | `checkNoShowPenalty()`, `countMonthlyNoShows()`, `detectNoShow()`, `getResidentBookingStatus()` |
| `apps/web/src/app/api/v1/appointments/[id]/verify/route.ts` | POST verify endpoint |
| `apps/web/src/app/api/v1/appointments/[id]/no-show/route.ts` | POST mark no-show + GET check endpoint |
| `apps/web/src/app/api/v1/residents/[id]/booking-status/route.ts` | GET booking eligibility status |
| `apps/web/src/app/(dashboard)/verification/page.tsx` | Staff verification page |
| `apps/mini-program/src/pages/appointments/status.vue` | Resident appointment status detail page (or enhance existing page) |
| `apps/web/src/__tests__/verification.test.ts` | Unit tests for verification rules |

### Files to Modify
| File | Change |
|------|--------|
| `packages/shared/src/constants/index.ts` | Add `VERIFIED` to `APPOINTMENT_STATUS`, add `VERIFICATION_ERRORS` constant |
| `packages/shared/src/schemas/index.ts` | Add verification schemas |
| `apps/web/src/lib/appointment-rules.ts` | Add `checkNoShowPenalty()` to `isBookingAllowed()` pipeline |
| `apps/web/src/app/(dashboard)/layout.tsx` | Add "预约核销" nav link |
| `apps/mini-program/src/pages.json` | Register new status page if created |
| `apps/web/src/app/(dashboard)/appointments/page.tsx` | Add "verified" to `STATUS_LABELS` and `STATUS_COLORS` |

## Key Design Decisions

### No-Show Detection Strategy
The 20-minute rule: if an appointment's `scheduledAt` + 20 minutes has passed and it's still "booked" (not verified, not cancelled), it's a no-show. Implementation options:
- **Manual trigger endpoint** (recommended for M001): `POST /api/v1/appointments/no-show-check` scans all today's booked appointments past the 20-min window. Staff clicks a "检查未到诊" button. Simple, testable, no background process needed.
- **Scheduled cron**: Would need a separate Node.js process or API route with `setInterval`. Overkill for dev; add in production deployment.

### No-Show Penalty Logic
- Count no-shows for a resident in the **current calendar month** where `appointment.status === 'no_show'`
- If count >= 2, booking is blocked
- Count resets automatically at month boundary (query filters by current month, no explicit reset needed)
- This is a pure query — `checkNoShowPenalty(tx, residentId, storeId)` counts no_show appointments this month

### Verification Flow
1. Staff opens `/verification` page → sees today's appointments with "booked" status
2. Staff clicks "核销" on an appointment → `POST /api/v1/appointments/:id/verify`
3. Server: validates appointment exists, status is "booked", creates `Verification` record, updates appointment status to "verified"
4. Idempotent: if already verified, return success (no error)

### Booking Status Endpoint
`GET /api/v1/residents/:id/booking-status` returns:
```json
{
  "canBook": false,
  "reasons": [
    { "code": "VERIFICATION_002", "message": "本月已有2次未到诊记录，暂无法预约" }
  ]
}
```
This is useful for the Mini Program to show why booking is disabled before the user tries.

## Risks

### Low Risk
- **Missing `verified` status**: Just needs to be added to the constant. Existing code won't break since it only checks for specific known statuses.
- **No-show count on Appointment model vs querying Verification**: The `noShowCount` field on Appointment is per-appointment. Monthly count is derived by querying all appointments with `status: "no_show"` for the resident in the current month. The `noShowCount` field could be used as a cache but is unnecessary — a count query is sufficient and always accurate.

### Medium Risk
- **isBookingAllowed integration**: Adding `checkNoShowPenalty` to the existing pipeline is straightforward but must be inserted at the right position (after monitoring check, before 15-day limit makes sense since it's a faster check). Must ensure existing tests still pass.
- **No-show auto-detection timing**: The manual trigger approach means no-shows aren't detected until staff runs the check. This is acceptable for M001 dev but should be documented as a known limitation.

## Verification Plan
- Unit tests for `checkNoShowPenalty()` (0 no-shows, 1 no-show, 2 no-shows, month boundary, cancelled appointments excluded)
- Unit tests for `detectNoShow()` (within 20 min, past 20 min, already verified, already cancelled)
- Unit tests for verification schemas
- Integration: verify `isBookingAllowed` rejects when 2 no-shows
- Structural verification script (`scripts/verify-s04.sh`) checking all new files exist, constants are exported, API endpoints respond
- `pnpm --filter @zhyj/shared build` — shared package compiles
- `pnpm --filter @zhyj/web test` — all tests pass
- `pnpm --filter @zhyj/web build` — web app compiles

## What S05 Should Know
- Only `status === "verified"` appointments can start robot sessions
- `GET /api/v1/appointments?status=verified` returns verified appointments for robot session linking
- The `Verification` model has `verifiedBy` (staff ID) and `verifiedAt` — useful for audit trail
- No-show appointments should NOT be available for robot sessions (status is "no_show", not "verified")
