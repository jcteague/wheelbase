# Research: US-15 — Roll Pair Display in Leg Timeline

## Is `rollChainId` already exposed by `getPosition`?

- **Decision:** No — `roll_chain_id` must be added to `GET_LEGS_QUERY`, `LegRow`, and `mapLegRow` in `get-position.ts`, and `rollChainId` must be added to `LegRecord` in `schemas.ts`.
- **Rationale:** The DB column (`roll_chain_id TEXT`) exists in the schema (migration 001) and is written by both `roll-csp-position.ts` and `roll-cc-position.ts`. However, `GET_LEGS_QUERY` in `src/main/services/get-position.ts` does not select it, `LegRow` interface does not declare it, and `LegRecord` in `src/main/schemas.ts` does not include it. The story says "all data is already available from `getPosition`" — this requires a small backend fix to fulfil that claim.
- **Alternatives considered:** Derive grouping from leg order alone (ROLL_FROM always precedes ROLL_TO in fill_date/created_at order). Rejected: two rolls on the same day would be ambiguous without `rollChainId`.

## Roll type derivation for the group header

- **Decision:** Use `getCcRollTypeLabel` from `src/renderer/src/lib/rolls.ts` for all roll pairs (CSP and CC alike). Use `getCcRollTypeDetail` to produce the strike/expiration detail string shown alongside the label.
- **Rationale:** `getCcRollTypeLabel` already handles all cases (same strike / different strike, same expiration / different expiration). `getRollTypeLabel` (CSP-only) only compares strikes and is narrower. The roll group header needs both the label ("Roll Down & Out") and the detail ("$180 → $175, Apr 18 → May 16").
- **Alternatives considered:** Separate CSP/CC roll type derivation. Rejected: unified utility avoids duplication and both functions already exist.

## Timeline data structure for mixed leg/roll-group rendering

- **Decision:** A `buildRollTimeline` pure function in a new `src/renderer/src/lib/rollGroups.ts` produces a typed discriminated-union array (`TimelineItem[]`) consumed by `LegHistoryTable`. Each item is either `{ type: 'leg', leg }` or `{ type: 'roll', rollNumber, rollType, rollDetail, fillDate, rollFromLeg, rollToLeg, net }`.
- **Rationale:** Keeps the grouping logic pure and independently testable. The component becomes a thin renderer over the timeline array.
- **Alternatives considered:** Detecting roll pairs inline inside the component's render loop. Rejected: harder to unit-test; the component already has enough rendering complexity.

## How to render spanning roll-group rows in a `<table>`

- **Decision:** Roll group header and cumulative summary render as full-width `<tr>` rows where a single `<td colspan={8}>` spans all columns. Individual ROLL_FROM/ROLL_TO leg rows render as normal `<tr>` rows with a blue-tinted background and additional left padding on the first cell to create visual indentation.
- **Rationale:** The existing component uses an HTML `<table>`. Spanning rows via `colspan` is the standard table approach and avoids a complete rewrite.
- **Alternatives considered:** Converting the table to a flex/grid layout. Rejected: out of scope; risks breaking existing column alignment and tests.

## Cumulative roll summary placement

- **Decision:** One `CumulativeSummaryRow` appears directly after the last roll group, before any subsequent normal legs (e.g. ASSIGN, CC_OPEN). It summarises total credits, total debits, and net across all roll groups.
- **Rationale:** Matches the mockup (`CumulativeSummary` appears after all roll groups) and the AC ("a cumulative summary shows...").
- **Alternatives considered:** Placing it in `<tfoot>`. Rejected: `<tfoot>` already holds the final P&L row; mixing them would be ambiguous.

## Roll group header net display

- **Decision:** The header row shows net credit/debit per contract only (e.g. "+$1.60/contract"). The per-contract figure appears in the right section of the spanning row. A separate total dollar amount is not shown in the header (the mockup matches this).
- **Rationale:** The mockup's `RollGroupHeader` right side shows `+$N.NN/contract`. The AC "Net Credit: $1.60/contract ($160.00 total)" appears to describe a summary line, which maps to the net section within the spanning header or a sub-row. On closer read, the AC refers to a "summary line" within the roll pair — this is the spanning header row.
- **Alternatives considered:** Showing both per-contract and total in the header. Not contradicted by the mockup but adds clutter; will show per-contract in header and total in cumulative summary.
