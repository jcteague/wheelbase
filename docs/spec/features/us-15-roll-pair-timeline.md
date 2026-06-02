# US-15: Roll pair timeline grouping

<!-- generated:from us-15 -->
## Summary

Extends the position-detail leg history table ([us-11-leg-history.md](./us-11-leg-history.md)) so that linked `ROLL_FROM` / `ROLL_TO` legs sharing a `roll_chain_id` render as a visually grouped section rather than two adjacent rows. Each group gets a spanning header row ("Roll #N — <Roll Type>" with date and net per contract), two indented blue-tinted leg rows, and — after the final group — a single cumulative summary spanning row totalling credits, debits, and net across all rolls. Non-roll legs continue to render normally and chronological ordering is preserved.

The change has three layers: a small backend extension surfacing the existing `legs.roll_chain_id` column through the `positions:get` response, a new pure renderer module (`rollGroups.ts`) that transforms a flat `LegHistoryEntry[]` into a discriminated-union `TimelineItem[]`, and a render-time dispatch inside `LegHistoryTable` that produces three row variants from each item type. No new IPC channels, no schema migrations.

## Acceptance criteria

- Given two legs sharing a `roll_chain_id` (`ROLL_FROM` + `ROLL_TO`), the table renders them inside a visually connected group with a header row "Roll #N — <Roll Type>" carrying the fill date, indented blue-tinted leg rows, and a per-contract net figure in the header.
- A net credit roll renders the per-contract figure (e.g. "+$1.60/contract") in green; a net debit renders it in amber/gold.
- For multiple rolls on the same position, group headers are numbered chronologically (`Roll #1`, `Roll #2`, …) by `ROLL_FROM` fill date; immediately after the last group a cumulative row shows "Total roll credits", "Total roll debits", and net across all groups.
- The roll-type label reflects both strike and expiration changes: a roll that moved $180 → $175 and Apr → May renders as "Roll Down & Out: $180 → $175, Apr 18 → May 16".
- Non-roll legs (`CSP_OPEN`, `ASSIGN`, `CC_OPEN`, …) render as normal single rows between and after roll groups; chronological order is maintained across the whole timeline.
- Running cost basis on the `ROLL_TO` row reflects the roll impact (prior $176.50 + $1.60 credit → $174.90); the `ROLL_FROM` running-basis cell is blank because the roll pair is atomic.

## What was built

The `getPosition` service ([src/main/services/get-position.ts](../../../src/main/services/get-position.ts)) was extended in two places: `GET_LEGS_QUERY` now SELECTs `roll_chain_id`, the `LegRow` DB interface gains `roll_chain_id: string | null`, and `mapLegRow` projects it onto the returned `LegRecord` as `rollChainId`. `LegRecord` in [src/main/schemas.ts](../../../src/main/schemas.ts) gained the matching nullable field. The column itself already exists in migration 001 and has been written by both roll services since US-12/US-13; this story only exposed it on read.

To keep `LegRecord` consistent, every other write-path service that constructs leg records now sets `rollChainId: null` explicitly — `assign-csp-position`, `close-csp-position`, `close-covered-call-position`, `expire-csp-position`, `expire-cc-position`, `open-covered-call-position`, `record-call-away-position`, and `positions` (CSP open). Only `roll-csp-position` and `roll-cc-position` pass the real shared UUID.

A new pure renderer module [src/renderer/src/lib/rollGroups.ts](../../../src/renderer/src/lib/rollGroups.ts) exports `buildRollTimeline(legs)` and `computeCumulativeRollSummary(rollGroups)`. `buildRollTimeline` partitions legs into roll vs normal, groups roll legs by `rollChainId` (each group must contain exactly one `ROLL_FROM` and one `ROLL_TO`), sorts groups by `ROLL_FROM` fill date ASC and assigns 1-based `rollNumber`s, derives `rollType` / `rollDetail` via `getCcRollTypeLabel` / `getCcRollTypeDetail` from [src/renderer/src/lib/rolls.ts](../../../src/renderer/src/lib/rolls.ts), computes `net` via `computeNetCreditDebit`, and interleaves the groups with normal legs chronologically. After the last roll group it appends one `{ type: 'cumulative', summary }` item produced by `computeCumulativeRollSummary`. The `LegHistoryEntry` type lives in this same module so both the timeline builder and the table component import a single shared definition.

[src/renderer/src/components/LegHistoryTable.tsx](../../../src/renderer/src/components/LegHistoryTable.tsx) now dispatches over `TimelineItem[]` instead of looping `LegHistoryEntry[]` directly. Three internal row components handle the variants: `LegRow({ leg, isRoll })` renders both normal legs and indented roll-pair legs (the same 8-column structure differing only in background tint and a `pl-7` indent on the first cell — consolidated from two near-identical functions during the layer-3 refactor), `RollGroupHeaderRow` renders a spanning `<tr><td colSpan={8}>` with role label, fill date, and per-contract net, and `CumulativeSummaryRow` renders a spanning row with totals. Each roll group's three `<tr>` outputs (header + two leg rows) are wrapped in a `React.Fragment` keyed by `rollChainId`.

Color tinting (credit/debit backgrounds for header and cumulative rows, blue-tint for roll legs, cumulative-row border-top) is centralized in module-level constants (`ROLL_CREDIT_BG`, `ROLL_DEBIT_BG`, `ROLL_LEG_BG`, `CUMULATIVE_BG`, `CUMULATIVE_BORDER_TOP`). Inline `style` is reserved for the cases where colors are runtime-derived from `rollCreditDebitColors` per group.

Premium and basis rendering on roll-pair rows: `ROLL_FROM` premium displays in red with a leading minus (it is the cost to close, not a credit), and the `ROLL_FROM` running-basis cell is blank — the roll pair is atomic and basis is shown only on the `ROLL_TO` row. Same-day rolls correctly cascade through `deriveRunningBasis` ([src/renderer/src/lib/deriveRunningBasis.ts](../../../src/renderer/src/lib/deriveRunningBasis.ts)), so a leg immediately after a same-day roll inherits the post-roll basis.

## Architecture decisions

- **Expose `rollChainId` through `getPosition` rather than infer pairs by leg ordering.** Two rolls on the same fill date would be ambiguous without the chain id, so the column is surfaced explicitly. The DB already stored it; only the read path needed widening. → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- **Use the unified `getCcRollTypeLabel` / `getCcRollTypeDetail` helpers for both CSP and CC roll pairs.** They already cover all four strike × expiration outcomes; the older CSP-only `getRollTypeLabel` only compares strikes and would have required parallel logic.
- **Pure `buildRollTimeline` returning a discriminated-union `TimelineItem[]`.** Grouping logic stays in a small testable module and the component becomes a thin renderer. Detecting roll pairs inline in `LegHistoryTable`'s render loop was rejected as harder to unit-test and additive complexity on an already non-trivial component.
- **Render roll groups as spanning `<tr>` rows via `<td colSpan={8}>` inside the existing `<table>`.** Avoids rewriting the table as flex/grid, preserves the existing column alignment, and leaves prior `LegHistoryTable` tests intact.
- **Cumulative summary row placed immediately after the last roll group, not in `<tfoot>`.** `<tfoot>` already holds the Final P&L row from US-11; mixing them would be ambiguous. The summary therefore appears in `<tbody>` directly after the last `RollGroupHeaderRow` + leg pair, before any subsequent normal legs.
- **Header shows net per contract only; total dollars live in the cumulative summary.** The per-contract figure (e.g. "+$1.60/contract") sits on the right of the spanning header; the total dollar amount is reserved for the cumulative row to avoid cluttering each group.
- **`LegHistoryEntry` co-located with `buildRollTimeline` in `rollGroups.ts`.** The type was redefined locally in `LegHistoryTable.tsx` before this story; moving it to `rollGroups.ts` lets both the builder and the table import the same definition and eliminates duplication.
- **Module-level color constants over inline magic rgba strings.** `ROLL_CREDIT_BG`, `ROLL_DEBIT_BG`, `ROLL_LEG_BG`, `CUMULATIVE_BG`, `CUMULATIVE_BORDER_TOP` are single-source-of-truth values; runtime-derived per-group colors remain inline because they depend on `rollCreditDebitColors`.
- **`ROLL_FROM` premium rendered in red with a leading minus; `ROLL_FROM` running-basis cell blank.** Reflects that closing the prior leg is a cost (not a credit) and that the roll pair is atomic for cost-basis purposes — basis only updates on `ROLL_TO`. → [domain/cost-basis.md](../domain/cost-basis.md)

## Contracts touched

- `positions:get` — IPC response unchanged in shape, but each entry in `legs[]` now carries `rollChainId: string | null` (UUID for `ROLL_FROM` / `ROLL_TO` pairs; `null` for every other leg role). No new channel, no breaking change. → [contracts/ipc-handlers.md](../contracts/ipc-handlers.md)
- `LegRecord` (Zod schema in [src/main/schemas.ts](../../../src/main/schemas.ts)) — gains `rollChainId: string | null`.
- `LegDetail` (renderer API type in [src/renderer/src/api/positions.ts](../../../src/renderer/src/api/positions.ts)) — mirrors the IPC payload extension with `rollChainId: string | null`.
- `LegRow` (DB row interface in `get-position.ts`) — adds `roll_chain_id: string | null`; `GET_LEGS_QUERY` SELECTs it; `mapLegRow` projects it to `rollChainId`.
- `mapActiveLeg` continues to return `rollChainId: null` even for `ROLL_TO` active legs (the `activeLeg` payload powers the position header only — current strike/expiration/premium — and the timeline reads from `legs[]`). Documented tech-debt note: if a future feature needs `activeLeg.rollChainId`, the `GET_QUERY` JOIN must add `l.roll_chain_id`.
- `LegHistoryEntry` (renderer component type, now exported from [src/renderer/src/lib/rollGroups.ts](../../../src/renderer/src/lib/rollGroups.ts)) — gains `rollChainId: string | null`.
- `buildRollTimeline(legs: LegHistoryEntry[]): TimelineItem[]` — new pure helper. `TimelineItem` is a discriminated union of `{ type: 'leg', leg }`, `{ type: 'roll', rollNumber, rollChainId, rollType, rollDetail, fillDate, rollFromLeg, rollToLeg, net: { isCredit, perContract, total } }`, and `{ type: 'cumulative', summary }`.
- `computeCumulativeRollSummary(rollGroups: RollGroup[]): CumulativeRollSummary` — new pure helper returning `{ totalCredits, totalDebits, net, rollCount }`.

## Schema

No new tables, no new migrations. The `roll_chain_id TEXT` column was added in migration 001 and has been written by `roll-csp-position` / `roll-cc-position` since US-12/US-13. The only schema-adjacent change is exposing the column through `getPosition` and through `LegRecord` on the TS side. → [schema/tables.md](../schema/tables.md)

## Source files

- [src/main/schemas.ts](../../../src/main/schemas.ts) — added `rollChainId: string | null` to `LegRecord`
- [src/main/services/get-position.ts](../../../src/main/services/get-position.ts) — `GET_LEGS_QUERY` SELECT extended; `LegRow` and `mapLegRow` add `roll_chain_id` / `rollChainId`
- [src/main/services/positions.ts](../../../src/main/services/positions.ts) — sets `rollChainId: null` on CSP_OPEN writes
- [src/main/services/assign-csp-position.ts](../../../src/main/services/assign-csp-position.ts) — sets `rollChainId: null`
- [src/main/services/close-covered-call-position.ts](../../../src/main/services/close-covered-call-position.ts) — sets `rollChainId: null`
- [src/main/services/close-csp-position.ts](../../../src/main/services/close-csp-position.ts) — sets `rollChainId: null`
- [src/main/services/expire-cc-position.ts](../../../src/main/services/expire-cc-position.ts) — sets `rollChainId: null`
- [src/main/services/expire-csp-position.ts](../../../src/main/services/expire-csp-position.ts) — sets `rollChainId: null`
- [src/main/services/open-covered-call-position.ts](../../../src/main/services/open-covered-call-position.ts) — sets `rollChainId: null`
- [src/main/services/record-call-away-position.ts](../../../src/main/services/record-call-away-position.ts) — sets `rollChainId: null`
- [src/main/services/roll-csp-position.ts](../../../src/main/services/roll-csp-position.ts) — already writes the shared UUID (no change required by this story; referenced for completeness)
- [src/main/services/roll-cc-position.ts](../../../src/main/services/roll-cc-position.ts) — already writes the shared UUID (no change required by this story; referenced for completeness)
- [src/renderer/src/api/positions.ts](../../../src/renderer/src/api/positions.ts) — `LegDetail` adds `rollChainId`
- [src/renderer/src/components/LegHistoryTable.tsx](../../../src/renderer/src/components/LegHistoryTable.tsx) — `TimelineItem` dispatch; `LegRow` / `RollGroupHeaderRow` / `CumulativeSummaryRow` internal components
- [src/renderer/src/lib/rollGroups.ts](../../../src/renderer/src/lib/rollGroups.ts) — new module: `LegHistoryEntry`, `TimelineItem`, `buildRollTimeline`, `computeCumulativeRollSummary`, color constants
- [src/renderer/src/lib/rolls.ts](../../../src/renderer/src/lib/rolls.ts) — consumed (`getCcRollTypeLabel`, `getCcRollTypeDetail`, `computeNetCreditDebit`, `rollCreditDebitColors`); no changes required by this story
- [src/renderer/src/lib/deriveRunningBasis.ts](../../../src/renderer/src/lib/deriveRunningBasis.ts) — regression coverage added for blank `ROLL_FROM` basis and same-day post-roll inheritance

## Open items

- Layer 4 E2E coverage (`e2e/us15-roll-pair-timeline.spec.ts`) is listed in `plans/us-15/tasks.md` but the spec file does not yet exist. Unit and integration coverage for AC1–AC7 is in place; end-to-end coverage is outstanding.

## Related

- Parent feature: [us-11-leg-history.md](./us-11-leg-history.md) — the leg history table this story extends with roll-pair grouping
- Roll mechanics: [us-12-roll-csp.md](./us-12-roll-csp.md), [us-13-roll-down-and-out.md](./us-13-roll-down-and-out.md) — the workflows that produce the linked `ROLL_FROM` / `ROLL_TO` pairs displayed here
<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
