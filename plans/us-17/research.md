# Research: US-17 — Reject Roll in Invalid Phase

## Existing Implementation Status

- **Decision:** No new implementation required for phase validation — `rollCsp` and `rollCc` already reject invalid phases in `src/main/core/lifecycle.ts`. The IPC handlers, service layer, and renderer action bar are also already wired up.
- **Rationale:** US-12 (CSP roll) and US-14 (CC roll) implemented the validation logic. US-17 is about ensuring **comprehensive test coverage** for all non-rollable phases at every layer (core, service, IPC, renderer component, e2e).
- **Alternatives considered:** N/A — no design decisions needed.

## Test Coverage Gaps

- **Decision:** Add parameterized/table-driven tests for all non-rollable phases at the lifecycle engine and service layers. Expand renderer component tests and add AC-driven e2e tests.
- **Rationale:** Current tests only verify 1–2 non-rollable phases per function. US-17 ACs require all 9 (CSP) / 9 (CC) non-rollable phases to be explicitly tested.
- **Current coverage:**
  - `rollCsp` rejects: only `HOLDING_SHARES` tested (1 of 9 phases)
  - `rollCc` rejects: only `CSP_OPEN` tested (1 of 9 phases)
  - `PositionDetailActions`: roll CSP hidden for `HOLDING_SHARES`, roll CC hidden for `CSP_OPEN` (2 phases each)
  - E2E: no tests for button visibility by phase or roll rejection

## Phase-to-Action Mapping (Already Implemented)

- **Decision:** The existing `PositionDetailActions` component already implements the correct phase-to-action mapping. No new UI work needed.
- **Rationale:** The component already renders "Roll CSP →" only for `CSP_OPEN`, "Roll CC →" only for `CC_OPEN`, and hides roll buttons for all other phases. Verified by reading `src/renderer/src/components/PositionDetailActions.tsx`.
- **Mapping confirmed:**
  - `CSP_OPEN` → [Roll CSP, Record Assignment, Record Expiration]
  - `CC_OPEN` → [Roll CC, Close CC Early, Record Call Away, Record CC Expiration]
  - `HOLDING_SHARES` → [Open Covered Call]
  - Terminal phases → no actions
