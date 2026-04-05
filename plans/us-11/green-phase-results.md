# Green Phase Results: US-11 — Display the full wheel leg chain with running cost basis

## Feature Context

- **Feature directory**: `plans/us-11/`
- **User story**: `docs/epics/02-stories/US-11-wheel-leg-chain-display.md`
- **Plan file**: `plans/us-11/plan.md`
- **Red phase results**: `plans/us-11/red-phase-results.md`
- **Mockup**: `mockups/us-11-wheel-leg-chain-display.mdx`

## Implementation Files Created/Modified

- `src/renderer/src/lib/deriveRunningBasis.ts` — same-day snapshot sequencing now preserves per-leg running basis progression
- `src/renderer/src/lib/deriveRunningBasis.test.ts` — added same-day multi-leg coverage
- `src/renderer/src/lib/format.ts` — `computeDte()` now compares ISO dates in UTC
- `src/renderer/src/lib/format.test.ts` — locked UTC-based DTE behavior
- `src/main/core/types.ts` — added `CC_EXPIRED` and `CALLED_AWAY` leg roles
- `src/main/core/types.test.ts` — covered the new leg-role enum values
- `src/main/services/record-call-away-position.ts` — persists a `CALLED_AWAY` leg for completed call-away cycles
- `src/main/services/record-call-away-position.test.ts` — updated call-away persistence expectations
- `src/main/services/expire-cc-position.ts` — persists a `CC_EXPIRED` leg for worthless expirations
- `src/main/services/expire-cc-position.test.ts` — updated CC-expiration persistence expectations
- `src/main/ipc/positions.test.ts` — updated mocked IPC response contracts for the new leg roles
- `src/renderer/src/api/positions.test.ts` — updated renderer adapter expectations for `CC_EXPIRED`
- `src/renderer/src/hooks/useRecordCallAway.test.ts` — updated hook response shape to `CALLED_AWAY`
- `e2e/helpers.ts` — kept E2E date seeding aligned with service-side UTC defaults
- `e2e/leg-chain-display.spec.ts` — final AC-driven E2E coverage for all seven US-11 scenarios

## Public Interfaces Implemented

Green phase preserved the existing public interfaces and corrected their returned leg-role values:

```typescript
// src/renderer/src/lib/deriveRunningBasis.ts
export function deriveRunningBasis<T extends { fillDate: string }>(
  legs: T[],
  snapshots: Array<{ snapshotAt: string; basisPerShare: string }>
): Array<T & { runningCostBasis: string | null }>

// src/main/services/record-call-away-position.ts
export function recordCallAwayPosition(
  db: Database.Database,
  positionId: string,
  payload: RecordCallAwayPayload
): RecordCallAwayResult
// result.leg.legRole === 'CALLED_AWAY'

// src/main/services/expire-cc-position.ts
export function expireCcPosition(
  db: Database.Database,
  positionId: string,
  payload: ExpireCcPayload
): ExpireCcPositionResult
// result.leg.legRole === 'CC_EXPIRED'
```

## Implementation Summary

### Approach

The failing E2E coverage exposed three concrete gaps: same-day running-basis rows were collapsing to the latest snapshot, call-away persistence still emitted `CC_CLOSE`, and CC expiration persistence still emitted a generic `EXPIRE` role. Green phase corrected those behaviors with the smallest cross-layer changes needed to make the AC-driven spec pass.

### Key Design Decisions

- **Same-day basis mapping stays renderer-local:** `deriveRunningBasis()` now groups legs and snapshots by fill date and assigns same-day snapshots in sequence so earlier rows keep their own basis while later rows inherit the latest available snapshot.
- **Date math uses UTC consistently:** `computeDte()` now evaluates persisted `YYYY-MM-DD` strings in UTC, matching the main-process defaults that already use `toISOString().slice(0, 10)`.
- **Leg-role semantics match the mockup contract:** the main process now records `CALLED_AWAY` and `CC_EXPIRED` explicitly so the renderer can display the story-specific row labels and annotations without special casing older roles.

### Deviations from Plan

- No new renderer component was required. The existing `LegHistoryTable` implementation already matched the mockup once the persisted leg roles and running-basis sequencing were corrected.

## Test Execution Results

```bash
pnpm exec electron-vite build && pnpm exec vitest run --config vitest.e2e.config.ts e2e/leg-chain-display.spec.ts

PASS e2e/leg-chain-display.spec.ts (7 tests)

pnpm test

Test Files  49 passed (49)
Tests  502 passed (502)
```

## Quality Checks

- `pnpm test` passed
- `pnpm lint` passed
- `pnpm typecheck` passed

## Known Limitations / Tech Debt

- The targeted US-11 E2E spec still needs an Electron-native rebuild immediately before execution because `pnpm test` rebuilds `better-sqlite3` for system Node.
- The E2E helpers still rely on visible success-state text like `View full position history`; extracting shared success-screen helpers would make future specs less repetitive.

## Handoff to Refactor Phase

Refactor work was limited to small cleanup within the green changes: helper reuse, stable UTC date handling, and formatting cleanup in the E2E spec. No further structural refactor was required to satisfy layer 4.

## Notes

The mockup was used as the source of truth for row labels and special premium-cell rendering:

- `CALLED_AWAY` → `Called Away` badge + `100 shares called away`
- `CC_EXPIRED` → `CC Expired` badge + `expired worthless`
- same-day lifecycle rows retain chronological running-basis progression
