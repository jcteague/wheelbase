# Refactor Phase Results: US-59 Layer 6 — E2E Tests

## Automated Simplification

- code-simplifier agent: not invoked — the e2e diff was small and the duplication found was a specific, well-understood cross-file pattern better handled as a targeted manual extraction.

## Manual Refactorings Performed

### 1. Extract shared "seed, then resolve by closing the leg" arrange-step — `e2e/alert-helpers.ts`

**Before**: `dismiss-alert.spec.ts`'s "dismissing an already resolved alert is rejected" test re-derived the exact same 8-line setup already present in `expiration-imminent-alert.spec.ts`'s "AC: Alert resolves after the leg is closed or expires" test — seed a CSP, evaluate, assert the alert opened, close the position via `window.api.closePosition`, assert success, evaluate again.
**After**: Added `seedAndResolveAlert(page, dbPath, fixture): Promise<{ positionId, openRow }>` to `alert-helpers.ts`. It throws a plain `Error` (not a vitest `expect`) on unexpected state, matching the existing `seedCsp`/`runDetectionNow` convention where arrange-helpers fail loudly rather than assert. Both spec files now call the shared helper; each test keeps only the assertions specific to its own scenario.
**Reason**: This exact duplication was flagged in the plan's own refactor note ("Check for duplication against `e2e/management-queue.spec.ts` and `e2e/expiration-imminent-alert.spec.ts`; share helpers via `alert-helpers.ts` rather than re-deriving DB assertions.").

No duplication was found against `management-queue.spec.ts` — its queue-rendering assertions and `queueTickers` helper don't overlap with anything in `dismiss-alert.spec.ts`.

## Test Execution Results

```
pnpm test:e2e dismiss-alert
Test Files  1 passed (1)
     Tests  4 passed (4)

pnpm test:e2e expiration-imminent-alert
Test Files  1 passed (1)
     Tests  4 passed (4)

pnpm test
Test Files  143 passed (143)
     Tests  1632 passed (1632)
```

## Quality Checks

- ✅ `pnpm test` passed (no regressions)
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed

## Files touched (production)

None — this layer is e2e-only; no `src/` production files changed.

## E2E coverage added or modified

- `e2e/dismiss-alert.spec.ts` — 4 scenarios (new), one per AC in `docs/epics/07-stories/US-59-dismiss-alert.md`
- `e2e/alert-helpers.ts` — `dismissed_at` added to `AlertRow`; `dismissAlertViaQueue` and `seedAndResolveAlert` helpers added
- `e2e/expiration-imminent-alert.spec.ts` — "AC: Alert resolves after the leg is closed or expires" refactored to use the new shared `seedAndResolveAlert` helper (no behavior change)

## Remaining Tech Debt

- [ ] Same pre-existing item as Layer 5: the `error.body.detail[0].message` extraction idiom is duplicated across 4 renderer files. Still out of scope for e2e-only Layer 6.

## Notes

All 4 e2e tests passed on the first run (Red), since Layers 1–5 already fully implemented the feature — no new production code was needed, matching the plan's own expectation for this layer ("No new production code expected — this area only confirms Layers 1–5 satisfy every AC end to end").
