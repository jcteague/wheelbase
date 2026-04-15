# Research: US-14 — Roll Open Covered Call

## Roll CC vs Roll CSP: Core Differences

- **Decision:** The CC roll follows the exact CSP roll architecture. All patterns (lifecycle → service → IPC → preload → API adapter → hook → sheet/form/success) are replicated with CALL instead of PUT, adjusted validations, and CC-specific UI.
- **Rationale:** The codebase has a clear, consistent implementation of CSP roll (US-12). Deviating from it would create inconsistency.
- **Alternatives considered:** Generalizing a single `rollPosition()` function with an `instrumentType` flag — rejected because the lifecycle validations are meaningfully different (expiration `>=` vs `>`, no-change guard) and CC adds the below-cost-basis warning which is CC-specific.

---

## Lifecycle Validation Differences

- **Decision:** `rollCc()` validates `newExpiration >= currentExpiration` (on or after), whereas `rollCsp()` validates `newExpiration > currentExpiration` (strictly after). Additionally, `rollCc()` must reject the case where both strike and expiration are unchanged.
- **Rationale:** CC rolls can be "same expiration, higher strike" (Roll Up) which is a valid and common scenario. The no-change guard prevents a no-op transaction from being recorded.
- **Alternatives considered:** Putting no-change validation only on the renderer — rejected because defense-in-depth is preferred; the lifecycle engine should be the source of truth for business rules.
- **Implementation:** `RollCcInput` includes `currentStrike` and `newStrike` (as formatted strings); the engine compares them to detect no-change.

---

## Roll Type Labels for CC

- **Decision:** Extend `src/renderer/src/lib/rolls.ts` with a new `getCcRollType()` function that returns one of: `'Roll Up & Out'`, `'Roll Down & Out'`, `'Roll Up'`, `'Roll Down'`, `'Roll Out'`, `'No Change'`. Add `getCcRollTypeColor()` returning CSS variable strings.
- **Rationale:** The existing `getRollTypeLabel()` only handles strike comparison, not expiration comparison. CC rolls can keep the same expiration (Roll Up / Roll Down) — a scenario that doesn't arise in CSP rolls (which always require a later expiration).
- **Alternatives considered:** Overloading the existing function — rejected because it changes the signature for existing callers.

---

## Below-Cost-Basis Warning

- **Decision:** Computed purely on the renderer inside `RollCcForm`. Compare `newStrike < basisPerShare` (numerically). Show amber `AlertBox variant="warning"` with exact loss-per-share amount. Non-blocking — the confirm button stays enabled.
- **Rationale:** Technical notes explicitly call this a renderer-side calculation. Experienced traders may intentionally sell a CC below basis in defensive scenarios (e.g., stock has dropped significantly).
- **Alternatives considered:** Backend validation error — explicitly excluded by Technical Notes.

---

## Cost Basis Calculation for CC Roll

- **Decision:** Reuse `calculateRollBasis()` from `src/main/core/costbasis.ts` unchanged. Net credit (newPremium − costToClose) reduces basis per share; net debit increases it.
- **Rationale:** The math is identical to CSP roll — the instrument type (CALL vs PUT) doesn't affect the cost basis formula. The function is already generic.
- **Alternatives considered:** A separate `calculateCcRollBasis()` — unnecessary duplication.

---

## Schema: Required vs Optional newStrike

- **Decision:** `newStrike` is `z.number().positive().optional()` in `RollCcPayloadSchema`. If omitted, the service defaults to `activeLeg.strike`. The lifecycle engine receives the resolved `newStrike` alongside `currentStrike` to check for no-change.
- **Rationale:** Consistent with `RollCspPayloadSchema` where `newStrike` is optional. The roll form pre-fills the current strike so the user always has a value; the optional pattern enables programmatic callers to omit it when keeping the same strike.

---

## No New Database Migrations Required

- **Decision:** No new tables or columns. The CC roll writes to existing `legs` and `cost_basis_snapshots` tables with `instrument_type = 'CALL'`, `leg_role = 'ROLL_FROM'` / `'ROLL_TO'`.
- **Rationale:** The schema already supports CALL instrument type (used by CC_OPEN legs). Roll legs follow the exact same structure as CSP roll legs.
