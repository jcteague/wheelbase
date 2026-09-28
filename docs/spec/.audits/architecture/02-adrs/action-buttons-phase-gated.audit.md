---
page: docs/spec/architecture/02-adrs/action-buttons-phase-gated.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/architecture/02-adrs/action-buttons-phase-gated.md

## Verified (8)

- ✓ `PositionDetailActions` component exists at `src/renderer/src/components/PositionDetailActions.tsx:36`.
- ✓ `CSP_OPEN` shows `Roll CSP →`, `Record Assignment →`, `Record Expiration →` — `PositionDetailActions.tsx:82-95`.
- ✓ Early close is a separate `CloseCspForm` (`src/renderer/src/components/CloseCspForm.tsx`, rendered from `src/renderer/src/pages/PositionDetailContent.tsx`), not a header action.
- ✓ `CC_OPEN` shows `Roll CC →`, `Close CC Early →`, `Record Call-Away →` — `PositionDetailActions.tsx:53-67`; CC `Record Expiration →` only when `ccExpired` — `PositionDetailActions.tsx:68-74`, with `ccExpired = phase === 'CC_OPEN' && computeDte(activeLeg.expiration) <= 0` at `src/renderer/src/pages/PositionDetailPage.tsx:120-121`.
- ✓ Terminal phases render no mutation buttons — no branch for `WHEEL_COMPLETE` / `CSP_CLOSED_*` in `PositionDetailActions.tsx`.
- ✓ Backend guard uses `__phase__` / `invalid_phase` — `src/main/core/lifecycle.ts:57,114,151`.
- ✓ `data-testid="{action}-btn"` convention — e.g. `roll-cc-btn`, `record-assignment-btn` (`PositionDetailActions.tsx:55,86`).
- ✓ Sheet open-contexts `openCcCtx` / `closeCcCtx` built on `PositionDetailPage` — `PositionDetailPage.tsx:82-83`.

## Drift (1)

- ✗ Consequences (line 29) say `PositionDetailActions` "receives the position record". It actually receives `phase`, `hasCostBasis` and `ccExpired` plus callbacks (`PositionDetailActions.tsx:4-16`); DTE is computed by the page, not the component. Also, `Open Covered Call →` is gated on `phase === 'HOLDING_SHARES' && hasCostBasis` (`PositionDetailActions.tsx:75`), a condition the Decision list (line 10) omits. Suggested fix: describe the narrow props and the `hasCostBasis` gate.

## Unverifiable (2)

- ? "Showing irrelevant buttons in the wrong phase produces obvious dead-ends" — UX rationale.
- ? "Per-phase action gating must be updated whenever a new mutation is added" — forward-looking guidance.

## Missing files (0)

- (none) — all six `../../.extracts/us-*.md` and six `../../features/us-*.md` links resolve.
