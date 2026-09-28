---
page: docs/spec/features/us-11-leg-history.md
audited_at: 2026-09-28
findings: 4
---

# Audit: docs/spec/features/us-11-leg-history.md

## Verified (22)

- ✓ All 26 listed source files exist, including `e2e/leg-chain-display.spec.ts` (7 `it`/`test` cases, one per AC) and `e2e/helpers.ts`
- ✓ `GET_ALL_SNAPSHOTS_QUERY` ordered `snapshot_at ASC` — `src/main/services/get-position.ts:139-145`
- ✓ `SnapshotRow`, `mapActiveLeg()`, `mapLatestSnapshot()` — `get-position.ts:147,90,113`
- ✓ Service returns `{ position, activeLeg, costBasisSnapshot, legs, allSnapshots }` — `get-position.ts:250`
- ✓ `GetPositionResult.allSnapshots: CostBasisSnapshotRecord[]` — `src/main/schemas.ts:154`
- ✓ `LegRole` includes `CC_EXPIRED` and `CALLED_AWAY` — `src/main/core/types.ts:24,26`
- ✓ `record-call-away-position.ts` persists `CALLED_AWAY` — `src/main/services/record-call-away-position.ts:78`
- ✓ `expire-cc-position.ts` persists `CC_EXPIRED` — `src/main/services/expire-cc-position.ts:51`
- ✓ `deriveRunningBasis<T extends { fillDate: string }>` — `src/renderer/src/lib/deriveRunningBasis.ts:48`; compares via `snapshotAt.slice(0, 10)` — `:5`
- ✓ `EnrichedLeg` type — `deriveRunningBasis.ts:2` (generic `T & { runningCostBasis }`, roughly as documented)
- ✓ `ROLE_COLOR` hex map exactly as documented — `src/renderer/src/lib/phase.ts:29-35`
- ✓ `LEG_ROLE_LABEL` entries `CSP Open`, `Assign`, `CC Open`, `CC Close`, `CC Expired`, `Called Away` — `phase.ts:38-45`
- ✓ `computeDte()` uses UTC — `src/renderer/src/lib/format.ts:48-55`
- ✓ `PremiumCell`, `BasisCell`, `formatDollarAmount()`, `assignmentAnnotationByRole` — `src/renderer/src/components/LegHistoryTable.tsx:73,77,28,23`
- ✓ "— (assigned)" and "expired worthless" muted italic cells — `LegHistoryTable.tsx:39,48`
- ✓ `CC_CLOSE` amber with U+2212 minus — `LegHistoryTable.tsx:58` (`text-wb-gold`); credits green `+` — `:67`
- ✓ Running-basis header `rgba(121,192,255,0.05)` / `#79c0ff` — `LegHistoryTable.tsx:219`; cell `#79c0ff` — `:83`
- ✓ Conditional `<tfoot>` with `colSpan={8}` on truthy `finalPnl` — `LegHistoryTable.tsx:241-254`; prop `finalPnl?: string | null` — `:16`
- ✓ `LegHistoryEntry` has `expiration: string | null`, `contracts: number`, `premiumPerContract: string | null`, `runningCostBasis: string | null` — `src/renderer/src/lib/rollGroups.ts:3-15`
- ✓ `LegDetail` / `SnapshotDetail` exported; `PositionDetail.allSnapshots: SnapshotDetail[]` — `src/renderer/src/api/positions.ts:116,132,163`
- ✓ `NoteBlock` helper — `src/renderer/src/pages/PositionDetailContent.tsx:24`
- ✓ All relative spec links resolve

## Drift (4)

- ✗ Line 27 and Source files line 96 say `PositionDetailPage` imports `deriveRunningBasis` and passes `enrichedLegs`/`finalPnl` to `LegHistoryTable`. The only non-test caller is now `src/renderer/src/components/position-cockpit/PositionCockpit.tsx:40-43` (and it is the only importer of `LegHistoryTable`, `:22`); `PositionDetailPage.tsx` has no `deriveRunningBasis` reference. Suggested fix: point to `PositionCockpit.tsx` (US-34).
- ✗ Line 49 documents `GET_ALL_SNAPSHOTS_QUERY` column list without `trigger_event`; the query now selects `trigger_event` too (`get-position.ts:141`).
- ✗ Line 25 describes `CC_CLOSE`/credit colours as `var(--wb-gold)` / `var(--wb-green)`; the component uses Tailwind tokens `text-wb-gold` / `text-wb-green` (`LegHistoryTable.tsx:58,67`) and adds a red debit branch (`:63`). Same tokens, stale mechanism.
- ✗ `LegHistoryTable` now also renders roll-group rows and a roll summary footer (`LegHistoryTable.tsx:126-192`), contradicting line "Full roll visualization is deferred to a future story" as a current-state claim. Probably superseded by US-15; flag the page for a pointer.

## Unverifiable (2)

- ? `O(n+m)` / "no look-ahead" complexity claim — not mechanically checked.
- ? "table is non-interactive in Phase 1 — no sorting, no pagination, no CSV export" — narrative scope note.

## Missing files (0)
