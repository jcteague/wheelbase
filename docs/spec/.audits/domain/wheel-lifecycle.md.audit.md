---
page: docs/spec/domain/wheel-lifecycle.md
audited_at: 2026-06-27
findings: 2
---

# Audit: docs/spec/domain/wheel-lifecycle.md

## Verified (16)

- ✓ Pure engine `src/main/core/lifecycle.ts` exists; all 10 documented
  transition functions are exported: `openWheel` (l.67), `closeCsp` (l.112),
  `expireCsp` (l.149), `openCoveredCall` (l.181), `recordCallAway` (l.243),
  `recordAssignment` (l.273), `expireCc` (l.303), `closeCoveredCall` (l.331),
  `rollCsp` (l.365), `rollCc` (l.398).
- ✓ `WheelPhase` Zod enum in `src/main/core/types.ts:7` includes all documented
  values: `CSP_OPEN`, `CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, `CSP_CLOSED_LOSS`,
  `CC_OPEN`, `HOLDING_SHARES`, `CC_EXPIRED`, `CC_CLOSED_PROFIT`,
  `CC_CLOSED_LOSS`, `WHEEL_COMPLETE`.
- ✓ `CloseCspInput` shape matches (`currentPhase, closePricePerContract,
openPremiumPerContract, closeFillDate, openFillDate, expiration`) —
  `src/main/core/lifecycle.ts:98-105`. No `contracts` field, as documented.
- ✓ `closeCsp` validations: `__phase__/invalid_phase`,
  `requirePositiveClosePrice`, `close_date_before_open`,
  `close_date_after_expiration` (`src/main/core/lifecycle.ts:112-130+`).
- ✓ `LegAction = z.enum(['SELL','BUY','EXPIRE','ASSIGN','EXERCISE'])` —
  `src/main/core/types.ts:3,31`. `EXERCISE` present.
- ✓ `InstrumentType = z.enum(['PUT','CALL','STOCK'])` (renamed from `OptionType`)
  — `src/main/core/types.ts:32`.
- ✓ `LegRole` enum includes `CALLED_AWAY`, `CC_EXPIRED`, `ASSIGN`, `EXPIRE`
  (`src/main/core/types.ts:9-29`).
- ✓ Migration `003_rename_option_type_to_instrument_type.sql` exists.
- ✓ `legs.roll_chain_id` present in `migrations/001_initial_schema.sql`.
- ✓ Active-leg resolution centralised in `src/main/services/active-leg-sql.ts`
  (exists).
- ✓ Roll services `roll-csp-position.ts` and `roll-cc-position.ts` exist.
- ✓ Renderer `buildRollTimeline` in `src/renderer/src/lib/rollGroups.ts:107`.
- ✓ `rollCc` validations: `requireCcOpenPhase`, `must_be_on_or_after_current`
  (`>=`), `no_change`, positive cost/premium
  (`src/main/core/lifecycle.ts:398-418`).
- ✓ `rollCsp` / `rollCc` reject non-`CSP_OPEN` / non-`CC_OPEN` with
  `__phase__`/`invalid_phase` (engine + service + renderer layering claim
  consistent).
- ✓ Engine purity: `src/main/core/lifecycle.ts` has no DB/broker imports
  (architecture-rule claim consistent with file).
- ✓ All linked "Driven by" feature pages (us-4..us-17) exist under
  `docs/spec/features/`.

## Drift (2)

- ✗ Page's `RollCspInput` and `RollCcInput` interfaces type
  `costToClosePerContract` and `newPremiumPerContract` as `number`
  (wheel-lifecycle.md ~l.407-408, l.479-480; the `rollCsp` block also annotates
  "us-12 — number"). The actual engine interfaces declare both as **`string`**:
  `RollCspInput` (`src/main/core/lifecycle.ts:353-358`,
  `costToClosePerContract: string` l.357, `newPremiumPerContract: string` l.358)
  and `RollCcInput` (l.384-391). Validation is via `requirePositiveDecimal` on
  string inputs (l.378-379, 417-418). Suggested fix: change documented field
  types from `number` to `string`.

- ✗ Page claims "The set is exported as the named constant `LEG_ACTION_VALUES`"
  (Leg enums / `EXERCISE` bullet, ~l.593). In code `LEG_ACTION_VALUES` is a
  module-private `const` — `src/main/core/types.ts:3`
  (`const LEG_ACTION_VALUES = [...] as const`), consumed only locally by
  `z.enum(LEG_ACTION_VALUES)` at l.31; it is **not** exported. Suggested fix:
  drop "exported" or export the constant.

## Unverifiable (1)

- ? "us-13 status: planned, not yet implemented" and the planned us-13 validation
  changes. Consistent with the current `rollCsp` engine (which still rejects
  same-expiration via the implemented rules), but "the us-13 plan dir contains
  only plan.md/research.md/..." is a plan-directory claim outside src/ and was
  not verified here.

## Missing files (0)

(none)
