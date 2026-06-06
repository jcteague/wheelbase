---
plan: us-9
source: plans/us-9/
extracted_at: 2026-05-30
status: complete
---

# Extract: us-9

## Summary

This story implements the covered-call expiry flow: when a `CC_OPEN` position's option expires worthless, the trader records the event, an `EXPIRE` leg is written, and the position transitions back to `HOLDING_SHARES` (still `ACTIVE`, still holding shares — the wheel stays alive). A new pure `expireCc()` function in the lifecycle engine validates phase (must be `CC_OPEN`) and date (`referenceDate >= expirationDate`) and returns `{ phase: 'HOLDING_SHARES' }`. A new `positions:expire-cc` IPC channel backed by an `expireCcPosition()` service inserts a single EXPIRE/CALL leg (`premium_per_contract = '0.0000'`, `fill_price = NULL`, `fill_date = recordedDate`) and updates the position phase — all in one transaction. Critically, **no new `cost_basis_snapshots` row is written** because the CC premium was already captured when the CC was opened in US-7. The renderer ships a `CcExpirationSheet` right-side panel with a confirmation state and a success state featuring a green hero card ("+$X.XX premium captured (100%)"), a "Still Holding: N shares" badge, a strategic 1–3 day nudge, and a "Sell New Covered Call on TICKER →" CTA. The "Record Expiration →" entry-point button only appears in the position detail header when `phase === 'CC_OPEN'` and `computeDte(activeLeg.expiration) <= 0`. No DB migration is required. **NOTE:** This plan directory has no `refactor-phase-results.md` — refactor-phase decisions are absent from this extract. If a refactor lands later, `/update-spec us-9` should incorporate it. (Source: `plans/us-9/plan.md`)

## Architecture Decisions

### ADR: New lifecycle function `expireCc()` returns `HOLDING_SHARES`, not `WHEEL_COMPLETE`
- **Decision:** Add a dedicated `expireCc()` to `src/main/core/lifecycle.ts` that returns `{ phase: 'HOLDING_SHARES' }`. CC expiry keeps the wheel alive; the position stays `ACTIVE` with `closedDate = null`.
- **Why:** Structurally different from `expireCsp()` (which ends the wheel at `WHEEL_COMPLETE`). After CC expiry the trader still holds shares and will sell another CC to continue the wheel.
- **Alternatives considered:** Reusing `expireCsp()` with a flag — rejected; separate function keeps core engine functions single-purpose.
- **Source:** `plans/us-9/research.md`

### ADR: No cost basis snapshot on CC expiry
- **Decision:** No new row is written to `cost_basis_snapshots` on CC expiry. The EXPIRE leg is the only DB mutation alongside the position phase update.
- **Why:** The CC premium was already incorporated into the snapshot created during `openCoveredCallPosition()` (US-7). The EXPIRE leg only records that the contract expired; no financial event changes the basis.
- **Alternatives considered:** Writing a snapshot for audit trail — rejected per story technical notes; the existing snapshot is already correct.
- **Source:** `plans/us-9/research.md`, `plans/us-9/data-model.md`

### ADR: Exact error message formats specified by ACs
- **Decision:** Wrong-phase rejection uses `"No open covered call on this position"`. Premature-expiry rejection uses `"Cannot record expiration before the expiration date (YYYY-MM-DD)"` with the literal `expirationDate` interpolated.
- **Why:** AC 3 and AC 4 quote these exact messages. The date-in-message pattern requires `expireCc()` to receive `expirationDate` as a string it can interpolate (not just a comparison value).
- **Alternatives considered:** Generic "invalid phase" message from `expireCsp` — rejected because AC specifies a different message.
- **Source:** `plans/us-9/research.md`, `plans/us-9/data-model.md`

### ADR: No DB migration required
- **Decision:** US-9 uses existing `legs` and `positions` tables only. `EXPIRE` leg role, `CALL` instrument type, and `HOLDING_SHARES` phase are already in the type enums (`src/main/core/types.ts`).
- **Why:** No new schema elements introduced; only new combinations of existing enum values.
- **Alternatives considered:** None.
- **Source:** `plans/us-9/research.md`, `plans/us-9/data-model.md`

### ADR: IPC channel naming follows established convention
- **Decision:** Channel is `positions:expire-cc`; preload method is `expireCc`.
- **Why:** Follows the established `positions:{verb}-{noun}` pattern (`positions:expire-csp`, `positions:open-cc`).
- **Alternatives considered:** `positions:expire-covered-call` — too verbose given the existing abbreviation convention.
- **Source:** `plans/us-9/research.md`, `plans/us-9/contracts/expire-cc.md`

### ADR: "Record Expiration →" button visibility is frontend-guarded by DTE
- **Decision:** Button appears in `PositionDetailActions` only when `phase === 'CC_OPEN'` AND `computeDte(activeLeg.expiration) <= 0` (today is on or after the CC expiration date).
- **Why:** Matches AC 3 ("Reject expiration before the expiration date") and the technical note: "Record Expiration → button visible in position detail header when phase = CC_OPEN and today ≥ CC expiration". `computeDte` already exists in `src/renderer/src/lib/format.ts`. Frontend guard provides better UX than relying solely on backend rejection.
- **Alternatives considered:** Always showing the button and relying on backend rejection — provides worse UX.
- **Source:** `plans/us-9/research.md`

### ADR: "Sell New Covered Call" CTA closes the sheet (no explicit navigation)
- **Decision:** The success-state CTA calls `onClose()`. After TanStack Query cache invalidation, the position refetches with `phase = HOLDING_SHARES` and the existing `OpenCoveredCallSheet` entry-point button becomes visible in the position detail header.
- **Why:** The user is already on the position detail page. Closing the sheet and letting the query refresh naturally surfaces the CC form — no extra navigation needed.
- **Alternatives considered:** Explicit `navigate(#/positions/${positionId})` — redundant since the user is already there.
- **Source:** `plans/us-9/research.md`

### ADR: `sharesHeld` included in IPC result (not re-queried by renderer)
- **Decision:** `ExpireCcPositionResult` includes `sharesHeld: number`, computed from the ASSIGN leg as `assignLeg.contracts * 100`.
- **Why:** The success screen needs "Still Holding: N shares of TICKER" and the renderer should not re-query the position to find this. The service already loads the position detail (including all legs) to perform validation, so computing this is zero-cost. `basisPerShare` from the snapshot is a money value, not a share count, so it cannot be used.
- **Alternatives considered:** Derive `sharesHeld` from `basisPerShare` — unreliable.
- **Source:** `plans/us-9/research.md`, `plans/us-9/contracts/expire-cc.md`

### ADR: `expirationDateOverride` plays double duty (referenceDate + recordedDate)
- **Decision:** The optional `expirationDateOverride` field on `ExpireCcPayloadSchema` serves as both `referenceDate` (the "today" used in the date guard) and `recordedDate` (the `fill_date` on the inserted leg) when provided.
- **Why:** Same dual-use pattern as `ExpireCspPayloadSchema.expirationDateOverride`. Used in tests to bypass system clock dependency; defaults to today and to the CC's expiration date respectively when omitted.
- **Source:** `plans/us-9/contracts/expire-cc.md`, `plans/us-9/plan.md` §3

### ADR: Worktree must merge local main before implementation
- **Decision:** Implementation must rebase or merge `main` into `worktree-us-9` first.
- **Why:** `worktree-us-9` was created from `origin/main` (commit `47f5412`) which predates the US-7 "open cover calls" commit (`9fb1928`) on local `main`. `expireCc` depends on `openCoveredCall` being present in `lifecycle.ts`, the `CC_OPEN` leg query in `get-position.ts`, and the `openCoveredCall` service.
- **Source:** `plans/us-9/research.md`, `plans/us-9/quickstart.md`

## Contracts

### `positions:expire-cc`
- **Type:** IPC handler (renderer → main, invoke / request-response)
- **Shape:**
  ```typescript
  // Request payload (validated by ExpireCcPayloadSchema)
  {
    positionId: string                  // UUID
    expirationDateOverride?: string     // YYYY-MM-DD; used in tests to bypass today's date
  }

  // Success response
  {
    ok: true,
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    },
    leg: LegRecord,                       // the newly inserted EXPIRE/CALL leg
    costBasisSnapshot: CostBasisSnapshotRecord,  // unchanged from CC open
    sharesHeld: number                    // ASSIGN leg.contracts × 100
  }

  // Error response
  { ok: false, errors: [{ field: string, code: string, message: string }] }
  ```

  Known error cases:
  | field        | code             | message                                                              |
  | ------------ | ---------------- | -------------------------------------------------------------------- |
  | `__root__`   | `not_found`      | "Position not found"                                                 |
  | `__phase__`  | `invalid_phase`  | "No open covered call on this position"                              |
  | `__root__`   | `no_active_leg`  | "Position has no active leg"                                         |
  | `expiration` | `too_early`      | "Cannot record expiration before the expiration date (YYYY-MM-DD)"   |
  | (field name) | (zod code)       | (zod message)                                                        |
  | `__root__`   | `internal_error` | "An unexpected error occurred"                                       |
- **Source:** `plans/us-9/contracts/expire-cc.md`, `plans/us-9/plan.md` §4
- **Implementation:** `src/main/ipc/positions.ts`, `src/main/services/expire-cc-position.ts`

### `ExpireCcPayloadSchema`
- **Type:** Zod schema
- **Shape:**
  ```typescript
  export const ExpireCcPayloadSchema = z.object({
    positionId: z.string().uuid(),
    expirationDateOverride: z.string().optional()  // YYYY-MM-DD
  })
  export type ExpireCcPayload = z.infer<typeof ExpireCcPayloadSchema>
  ```
- **Source:** `plans/us-9/contracts/expire-cc.md`, `plans/us-9/plan.md` §2
- **Implementation:** `src/main/schemas.ts`

### `ExpireCcPositionResult`
- **Type:** other (IPC return type definition)
- **Shape:**
  ```typescript
  export interface ExpireCcPositionResult {
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    }
    leg: LegRecord                       // the newly inserted EXPIRE/CALL leg
    costBasisSnapshot: CostBasisSnapshotRecord  // unchanged from CC open
    sharesHeld: number                   // ASSIGN leg.contracts × 100
  }
  ```
- **Source:** `plans/us-9/plan.md` §2, `plans/us-9/contracts/expire-cc.md`
- **Implementation:** `src/main/schemas.ts`

### `ExpireCcInput` / `ExpireCcResult` (lifecycle engine)
- **Type:** other (core lifecycle function signature)
- **Shape:**
  ```typescript
  ExpireCcInput {
    currentPhase: WheelPhase
    expirationDate: string             // ISO date (YYYY-MM-DD)
    referenceDate: string              // ISO date (YYYY-MM-DD)
  }

  ExpireCcResult {
    phase: 'HOLDING_SHARES'
  }
  ```
  Engine throws `ValidationError` with one of:
  - `__phase__` / `invalid_phase` / "No open covered call on this position" — when `currentPhase !== 'CC_OPEN'`
  - `expiration` / `too_early` / "Cannot record expiration before the expiration date (${expirationDate})" — when `referenceDate < expirationDate`

  Boundary: `referenceDate === expirationDate` is **allowed** (passes); one day earlier throws.
- **Source:** `plans/us-9/plan.md` §1, `plans/us-9/data-model.md`
- **Implementation:** `src/main/core/lifecycle.ts`

### Preload bridge addition
- **Type:** other (preload contextBridge API)
- **Shape:**
  ```typescript
  expireCc: (payload: unknown) => ipcRenderer.invoke('positions:expire-cc', payload)
  ```
  Type declaration in `src/preload/index.d.ts`:
  ```typescript
  expireCc: (payload: unknown) => Promise<{ ok: boolean; [key: string]: unknown }>
  ```
- **Source:** `plans/us-9/plan.md` §5, `plans/us-9/contracts/expire-cc.md`
- **Implementation:** `src/preload/index.ts`, `src/preload/index.d.ts`

### Renderer `ExpireCcPayload` / `ExpireCcResponse`
- **Type:** other (renderer adapter types — snake_case payload)
- **Shape:**
  ```typescript
  export type ExpireCcPayload = {
    position_id: string
    expiration_date_override?: string
  }

  export type ExpireCcResponse = {
    position: {
      id: string
      ticker: string
      phase: 'HOLDING_SHARES'
      status: 'ACTIVE'
      closedDate: null
    }
    leg: LegData & {
      legRole: string
      action: string
      instrumentType: string
      premiumPerContract: string
      fillDate: string
      createdAt: string
      updatedAt: string
    }
    costBasisSnapshot: {
      id: string
      positionId: string
      basisPerShare: string
      totalPremiumCollected: string
      finalPnl: string | null
      snapshotAt: string
      createdAt: string
    }
    sharesHeld: number
  }
  ```
- **Source:** `plans/us-9/contracts/expire-cc.md`, `plans/us-9/plan.md` §6
- **Implementation:** `src/renderer/src/api/positions.ts`

### Renderer API adapter snake_case ↔ camelCase mapping
- **Type:** other (renderer adapter mapping)
- **Shape:**
  ```
  expireCc payload (renderer snake_case -> IPC camelCase):
    position_id                -> positionId
    expiration_date_override   -> expirationDateOverride
  ```
  On IPC `{ ok: false }`, the adapter throws `ApiError` with `status: 400` and `body.detail = mapIpcErrors(errors)` — same error-mapping pattern as `expirePosition` (CSP).
- **Source:** `plans/us-9/plan.md` §6, `plans/us-9/contracts/expire-cc.md`
- **Implementation:** `src/renderer/src/api/positions.ts`

### `useExpireCoveredCall` mutation hook
- **Type:** other (renderer TanStack Query mutation hook)
- **Shape:**
  ```typescript
  useExpireCoveredCall(options?: { onSuccess?: (data: ExpireCcResponse) => void }):
    useMutation<ExpireCcResponse, ApiError, ExpireCcPayload>
  ```
  Invalidates `positionQueryKeys.all` on success; forwards optional `onSuccess` callback (used by the sheet to transition to its success state). Thin wrapper — no isolated unit test; covered by component tests + e2e.
- **Source:** `plans/us-9/plan.md` §7
- **Implementation:** `src/renderer/src/hooks/useExpireCoveredCall.ts`

### `CcExpirationSheet` component props
- **Type:** other (renderer component contract)
- **Shape:**
  ```typescript
  interface CcExpirationSheetProps {
    open: boolean
    positionId: string
    ticker: string
    strike: string
    expiration: string              // YYYY-MM-DD
    expirationDisplay: string       // e.g. "Feb 21, 2026"
    contracts: number
    premiumPerContract: string      // e.g. "2.3000"
    sharesHeld: number              // passed from PositionDetailPage
    onClose: () => void
  }
  ```
  Right-side 400px sheet rendered via `createPortal` into `document.body`, following `ExpirationSheet.tsx`. Internal state: `successState: boolean` (true after mutation succeeds — all display data comes from props). Helper: `totalPremium = (parseFloat(premiumPerContract) * contracts * 100).toFixed(0)`.
- **Source:** `plans/us-9/plan.md` §8
- **Implementation:** `src/renderer/src/components/CcExpirationSheet.tsx`

## Schema Changes

### No new tables, columns, or migrations
- **Change:** none — US-9 uses existing `legs` and `positions` tables. No migration required.
- **Source:** `plans/us-9/data-model.md`, `plans/us-9/research.md`

### `legs` row INSERT — EXPIRE leg on CC expiry
- **Change:** new row (no schema change)
- **Columns / fields:**
  | Field                  | Value                                        |
  | ---------------------- | -------------------------------------------- |
  | `id`                   | new UUID                                     |
  | `position_id`          | FK → CC_OPEN position's ID                   |
  | `leg_role`             | `'EXPIRE'`                                   |
  | `action`               | `'EXPIRE'`                                   |
  | `instrument_type`      | `'CALL'`                                     |
  | `strike`               | copied from the active CC_OPEN leg           |
  | `expiration`           | copied from the active CC_OPEN leg           |
  | `contracts`            | copied from the active CC_OPEN leg           |
  | `premium_per_contract` | `'0.0000'` — expiration collects no premium  |
  | `fill_price`           | `NULL` — no market fill on expiry            |
  | `fill_date`            | recordedDate (CC's expiration date string, YYYY-MM-DD) |
  | `created_at`           | ISO timestamp now                            |
  | `updated_at`           | ISO timestamp now                            |
- **Source:** `plans/us-9/data-model.md`
- **Migration file:** none

### `positions` row UPDATE on CC expiry
- **Change:** altered row (no schema change)
- **Columns / fields:**
  | Field         | Before        | After                |
  | ------------- | ------------- | -------------------- |
  | `phase`       | `CC_OPEN`     | `HOLDING_SHARES`     |
  | `status`      | `ACTIVE`      | `ACTIVE` (no change) |
  | `closed_date` | `NULL`        | `NULL` (no change)   |
  | `updated_at`  | prior value   | ISO timestamp now    |
- **Source:** `plans/us-9/data-model.md`

### `cost_basis_snapshots` — explicitly NOT touched
- **Change:** no row inserted, updated, or deleted on CC expiry. The existing snapshot (written when the CC was opened in US-7) remains the source of truth for `basisPerShare` and `totalPremiumCollected`.
- **Why:** CC premium was already captured at CC-open; expiry is not a financial event.
- **Source:** `plans/us-9/data-model.md`, `plans/us-9/research.md`

## Acceptance Criteria

Background:
- The trader has a CC_OPEN position on AAPL
- The CC strike is $182.00 with $2.30 premium, expiration "2026-02-21", 1 contract
- Today is on or after "2026-02-21"

- Scenario: Successfully record a CC expiring worthless
  - Given the position is in CC_OPEN phase on expiration date "2026-02-21"
  - When the trader clicks "Record Expiration →" and confirms
  - Then the position phase changes back to HOLDING_SHARES
  - And an EXPIRE leg is recorded with `fill_date = "2026-02-21"` and premium $0.00
  - And the success screen shows "+$230.00 premium captured (100%)"
  - And a "Sell New Covered Call" CTA is visible
- Scenario: Full premium kept in the success state
  - Given the CC was sold at $2.30 premium, 1 contract
  - When the expiration is recorded
  - Then the success screen shows total premium collected including this CC: $230.00
- Scenario: Reject expiration before the expiration date
  - Given today is "2026-02-20" (one day before expiration "2026-02-21")
  - When the trader attempts to record expiration
  - Then the action is rejected with message "Cannot record expiration before the expiration date (2026-02-21)"
  - And the position remains in CC_OPEN
- Scenario: Reject expiration when not in CC_OPEN phase
  - Given the position is in HOLDING_SHARES phase
  - When the trader attempts to record CC expiration
  - Then the action is rejected with message "No open covered call on this position"
- Scenario: Success state shows strategic nudge before sell-next-CC CTA
  - Given the CC expiration has been confirmed
  - Then the success screen shows:
    "Many traders wait 1–3 days before selling the next covered call — avoid chasing premium right at expiration."
  - And a "Sell New Covered Call on AAPL →" button is visible below the nudge

(Source: `docs/epics/02-stories/US-9-record-cc-expiring-worthless.md`)

## Decisions & Tradeoffs

- Phase transition is the single valid one: `CC_OPEN → HOLDING_SHARES`. The position stays `ACTIVE` and `closedDate` remains `NULL`. (Source: `plans/us-9/data-model.md`)
- `LegRole: EXPIRE`, `LegAction: EXPIRE`, `InstrumentType: CALL` enum values already exist in `src/main/core/types.ts` — no new types needed. (Source: `plans/us-9/research.md`)
- The active CC leg is looked up via the existing `get-position.ts` query (`WHERE p.phase = 'CC_OPEN' AND leg_role = 'CC_OPEN'`); no service changes needed there. (Source: `plans/us-9/data-model.md`)
- The boundary case `referenceDate === expirationDate` is **allowed** (passes the date guard). Only `referenceDate < expirationDate` throws `too_early`. Explicit boundary test covers this. (Source: `plans/us-9/plan.md` §1)
- The service-layer date contract: `referenceDate = payload.expirationDateOverride ?? today`; `recordedDate = payload.expirationDateOverride ?? openLeg.expiration` (separately resolved; both default to natural values). (Source: `plans/us-9/plan.md` §3)
- Service explicitly guards against a missing CC_OPEN leg with `no_active_leg` / `__root__` even though the phase guard normally precludes this state — defensive against corrupt fixtures or partial transactions. (Source: `plans/us-9/plan.md` §3)
- The "Sell New Covered Call on TICKER →" CTA dynamically interpolates the ticker prop (e.g. "Sell New Covered Call on AAPL →"). (Source: `plans/us-9/plan.md` §8)
- The success-state hero card composition: caption "Premium Captured" (green small caps), large amount "+$${totalPremium}" (font-size 40, green), sub-line "100% premium captured · {contracts} contract", inline "Still Holding" badge ("{sharesHeld} shares of {ticker}", sky blue). (Source: `plans/us-9/plan.md` §8)
- The strategic nudge uses `AlertBox variant="info"` and contains the exact text "💡 Many traders wait 1–3 days before selling the next covered call — avoid chasing premium right at expiration." (Source: `plans/us-9/plan.md` §8)
- `PositionDetailPage` derives `assignLeg = legs.find(l => l.legRole === 'ASSIGN')` and passes `sharesHeld = assignLeg?.contracts ? assignLeg.contracts * 100 : 0` to the sheet — frontend mirror of the same computation done server-side for `sharesHeld` in the IPC result. (Source: `plans/us-9/plan.md` §9)
- `PositionDetailPage` blur condition includes `ccExpCtx` alongside `expirationCtx`, `assignmentCtx`, `openCcCtx` so the page dims while the CC expiration sheet is open. (Source: `plans/us-9/plan.md` §9)
- The IPC handler uses the shared `handleIpcCall('positions_expire_cc_unhandled_error', ...)` wrapper, consistent with `positions:expire-csp` and other existing channels. (Source: `plans/us-9/plan.md` §4)
- No isolated unit tests for the preload bridge or the `useExpireCoveredCall` hook — coverage comes from IPC handler tests + component tests + e2e, mirroring the testing strategy of US-7. (Source: `plans/us-9/plan.md` §5, §7)
- E2E spec includes 5 scenarios mapped 1:1 to ACs in `e2e/cc-expiration.spec.ts`. AC 3 ("reject before expiration") is asserted via UI absence: with DTE > 0 the "Record Expiration →" button is not rendered, so the rejection path manifests as the button being unreachable. The backend rejection is exercised separately via a direct IPC call against a HOLDING_SHARES position. (Source: `plans/us-9/plan.md` §10)
- Manual-test scenario uses different example years than the AC background (manual test uses 2025 calendar; AC background uses 2026). The numeric values (strikes $180/$182, premiums $3.50/$2.30, premium total $580, basis $174.20) match across both. (Source: `plans/us-9/manual-test.md`, `docs/epics/02-stories/US-9-record-cc-expiring-worthless.md`)
- The EXPIRE leg's role is rendered in the UI via `LEG_ROLE_LABEL` as "Expired"; premium displays as `$0.00`; fill date displays as the CC's expiration date. (Source: `plans/us-9/manual-test.md`)

## Source Code References

Files this plan introduced or modified (verified to exist on disk at extraction time):

- `src/main/core/lifecycle.ts` — added `ExpireCcInput`, `ExpireCcResult`, `expireCc()`.
- `src/main/core/lifecycle.test.ts` — added `describe('expireCc')` test suite covering phase guard, date guard, and boundary cases.
- `src/main/schemas.ts` — added `ExpireCcPayloadSchema`, `ExpireCcPayload`, `ExpireCcPositionResult`.
- `src/main/schemas.test.ts` — added Zod parse tests for `ExpireCcPayloadSchema`.
- `src/main/services/expire-cc-position.ts` — new service following `expire-csp-position.ts` pattern.
- `src/main/services/expire-cc-position.test.ts` — new integration test file.
- `src/main/services/positions.ts` — re-exports `expireCcPosition`.
- `src/main/ipc/positions.ts` — added `positions:expire-cc` handler using shared `handleIpcCall('positions_expire_cc_unhandled_error', ...)` wrapper.
- `src/main/ipc/positions.test.ts` — added IPC handler tests.
- `src/preload/index.ts` — added `expireCc` to `window.api`.
- `src/preload/index.d.ts` — added `expireCc` type declaration.
- `src/renderer/src/api/positions.ts` — added `ExpireCcPayload`, `ExpireCcResponse`, `expireCc()` adapter.
- `src/renderer/src/api/positions.test.ts` — added adapter tests (snake_case ↔ camelCase, error mapping).
- `src/renderer/src/hooks/useExpireCoveredCall.ts` — new TanStack Query mutation hook.
- `src/renderer/src/components/CcExpirationSheet.tsx` — new right-side sheet component (confirmation + success states).
- `src/renderer/src/components/CcExpirationSheet.test.tsx` — component test file.
- `src/renderer/src/components/PositionDetailActions.tsx` — added `onRecordCcExpiration` prop, `ccExpired` prop, and "Record Expiration →" button gated by `phase === 'CC_OPEN' && ccExpired`.
- `src/renderer/src/pages/PositionDetailPage.tsx` — added `ccExpCtx` state, `ccExpired` derivation via `computeDte`, `CcExpirationSheet` render, `assignLeg` lookup for `sharesHeld` derivation, blur-condition inclusion.
- `src/renderer/src/pages/PositionDetailPage.test.tsx` — added tests for button visibility (CC_OPEN + DTE≤0, CC_OPEN + DTE>0, HOLDING_SHARES) and sheet-open click.
- `e2e/cc-expiration.spec.ts` — 5 e2e tests, one per AC scenario.

## Open Questions

**No `refactor-phase-results.md` exists for this plan.** This extract therefore records no Refactor-phase decisions, simplifications, file splits, or post-refactor test counts. The Refactor-phase "cleanup to consider" hints in `plans/us-9/plan.md` were:
- §1 (`expireCc`): Extract a `requirePhase` helper if the pattern repeats across `expireCsp` and `expireCc` — gated on genuine duplication reduction.
- §2 (schemas): Check naming consistency with `ExpireCspPayload` / `ExpireCspPositionResult`.
- §3 (service): Check for duplication with `expire-csp-position.ts` in date handling; extract a helper only if ≥3 uses emerge.
- §4 (IPC): Naming consistency with `positions_expire_csp_unhandled_error`.
- §5 (preload): Naming consistency with `expirePosition` (CSP) and `openCoveredCall` (US-7).
- §6 (renderer adapter): Check for duplication with `expirePosition` — structurally identical except method name and types.
- §8 (component): Extract shared sheet-chrome JSX into a helper if `ExpirationSheet` duplication exceeds ~30 lines.
- §9 (PositionDetailActions): If component grows beyond ~60 lines, extract per-phase action groups into sub-components.
- §10 (e2e): Extract CC fixture setup (create → assign → open-CC) into a shared helper if used across multiple e2e files.

If a Refactor pass lands later, `/update-spec us-9` should re-extract and merge those decisions into this page. (Source: `plans/us-9/plan.md` — Refactor sections; absence of `plans/us-9/refactor-phase-results.md` on disk at extraction time.)

Deferred / out of scope (noted in story, not unresolved): automatic expiration detection via Alpaca polling (Epic 06), rolling the CC at expiration (Epic 03), partial expiration where some contracts are in-the-money (deferred). (Source: `docs/epics/02-stories/US-9-record-cc-expiring-worthless.md`)
