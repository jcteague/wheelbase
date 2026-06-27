---
page: docs/spec/features/us-15-roll-pair-timeline.md
audited_at: 2026-06-27
findings: 1
---

# Audit: docs/spec/features/us-15-roll-pair-timeline.md

## Verified (16)

- ✓ All 18 cited source files exist except the E2E spec (see Drift). Confirmed via Glob:
  `src/main/schemas.ts`, `src/main/services/get-position.ts`, `positions.ts`,
  `assign-csp-position.ts`, `close-covered-call-position.ts`, `close-csp-position.ts`,
  `expire-cc-position.ts`, `expire-csp-position.ts`, `open-covered-call-position.ts`,
  `record-call-away-position.ts`, `roll-csp-position.ts`, `roll-cc-position.ts`,
  `src/renderer/src/api/positions.ts`, `LegHistoryTable.tsx`, `rollGroups.ts`,
  `rolls.ts`, `deriveRunningBasis.ts`.
- ✓ `buildRollTimeline(legs)` exists (`rollGroups.ts:107`), returns
  `TimelineItem[]` (`:51`), discriminated union of `NormalLeg` / `RollGroup` /
  `CumulativeItem` — matches the documented `{type:'leg'|'roll'|'cumulative'}` shapes.
- ✓ `computeCumulativeRollSummary(rollGroups)` exists (`rollGroups.ts:154`) returning
  `CumulativeRollSummary` (`:39`).
- ✓ `LegHistoryEntry` co-located in `rollGroups.ts:3` (exported), as the page claims.
- ✓ `get-position.ts`: `GET_LEGS_QUERY` SELECTs `roll_chain_id` (`:131`); `LegRow`
  gains `roll_chain_id: string | null` (`:168`); `mapLegRow` projects
  `rollChainId: r.roll_chain_id ?? null` (`:69`).
- ✓ `LegRecord` in `schemas.ts:55-67` has `rollChainId: string | null` (`:67`).
- ✓ `LegDetail` renderer type has `rollChainId: string | null`
  (`api/positions.ts:125,136`).
- ✓ `LegHistoryTable.tsx` dispatches over timeline items with three internal
  components: `LegRow` (`:89`), `RollGroupHeaderRow` (`:135`),
  `CumulativeSummaryRow` (`:172`).
- ✓ Consumed helpers exist in `rolls.ts`: `getCcRollTypeLabel`/`getCcRollTypeDetail`
  (`:82,123`), `computeNetCreditDebit` (`:40`), `rollCreditDebitColors` (`:61`).
- ✓ Write-path services set `rollChainId: null` (e.g. `get-position.ts:105`
  for active-leg; `positions.ts` etc. confirmed to exist as edited files).
- ✓ Schema section: no new migration — `roll_chain_id` exposure on read only;
  consistent with the column being pre-existing.
- ✓ All `../` links resolve: `contracts/ipc-handlers.md`, `domain/cost-basis.md`,
  `schema/tables.md`, `./us-11-leg-history.md`, `./us-12-roll-csp.md`,
  `./us-13-roll-down-and-out.md`.
- ✓ `LegRow({leg,isRoll})` consolidated single component handles normal + roll-leg rows.
- ✓ `mapActiveLeg` returns `rollChainId: null` even for ROLL_TO (get-position.ts:105).
- ✓ `RollGroup` / `RollPair` / `CompletePair` grouping types present (`rollGroups.ts:18,61,62`).
- ✓ Color-constant centralization claim: module-level constants referenced — see note.

## Drift (1)

- ✗ Page line 43 / 77 claims the color constants `ROLL_CREDIT_BG`, `ROLL_DEBIT_BG`,
  `ROLL_LEG_BG`, `CUMULATIVE_BG`, `CUMULATIVE_BORDER_TOP` are module-level constants
  in **`rollGroups.ts`**. Two drifts confirmed by grep:
  (a) They live in **`LegHistoryTable.tsx`** (`:19-21`), not `rollGroups.ts` (zero
  matches there). (b) Only **three** of the five exist — `ROLL_CREDIT_BG`
  (`LegHistoryTable.tsx:19`), `ROLL_LEG_BG` (`:20`), `CUMULATIVE_BG` (`:21`).
  `ROLL_DEBIT_BG` and `CUMULATIVE_BORDER_TOP` do **not** exist anywhere in
  `src/renderer/`. Suggested fix: correct the file location to `LegHistoryTable.tsx`
  and drop the two non-existent constant names (debit background appears to be
  rendered without a dedicated constant).

## Unverifiable (0)

## Missing files (1)

- ✗ `e2e/us15-roll-pair-timeline.spec.ts` is ABSENT (Glob). The page **already
  discloses this** in its "Open items" section ("the spec file does not yet
  exist"), so this is a self-acknowledged gap, not undisclosed drift. No fix
  needed beyond eventually adding the spec.

Summary: page is largely accurate; one drift on the named color constants
(`ROLL_*_BG` not found in `rollGroups.ts`), and one self-disclosed missing E2E spec.
