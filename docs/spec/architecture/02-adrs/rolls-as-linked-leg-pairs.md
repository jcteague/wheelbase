# ADR: Rolls are stored as linked ROLL_FROM / ROLL_TO leg pairs

<!-- generated:from us-12,us-104 -->

## Decision

A CSP roll is recorded as **two new legs**, written in the same transaction, sharing a freshly minted `roll_chain_id` (UUID):

- `ROLL_FROM` leg: `action = 'BUY'` (buy-to-close), `strike = currentStrike`, `expiration = currentExpiration`, `premium_per_contract = costToClosePerContract`.
- `ROLL_TO` leg: `action = 'SELL'` (sell-to-open), `strike = newStrike ?? currentStrike`, `expiration = newExpiration`, `premium_per_contract = newPremiumPerContract`.

The original `CSP_OPEN` leg is never mutated. The `positions` row is not updated — `phase` stays `CSP_OPEN`. A new `cost_basis_snapshots` row records the net effect of the roll. The `legs.roll_chain_id` column already exists from migration 001.

This is the canonical immutable-history pattern called out by the CLAUDE.md architecture rules: "Rolls are always stored as linked leg pairs, never in-place updates."

**PMCC short-call roll (US-104).** The same shape applies to a PMCC's short call. `rollPmccShortCallPosition` writes a `ROLL_FROM` / `BUY` / `CALL` leg (the open short's strike, expiration and contracts; `premium_per_contract = fill_price = costToClosePerContract`) and a `ROLL_TO` / `SELL` / `CALL` leg (replacement strike and expiration; `newPremiumPerContract`), sharing one fresh `roll_chain_id`, plus exactly one `cost_basis_snapshots` row — appended by US-103's `appendPmccSnapshot` with `triggerEvent = 'PMCC_SHORT_ROLL'` — all in one `db.transaction`. The PMCC roll computes no basis of its own; the ledger nets the chain (`SELL − BUY`). The `positions` row is untouched (`phase` stays `PMCC_OPEN`, `updated_at` not bumped, parity with the wheel CC roll). Both legs write `fees = '0.0000'` (no fees input), as wheel rolls do. No migration was needed.

**Short vs LEAPS chains.** A PMCC can hold rolls on either side. A chain is classified by its `ROLL_FROM` leg's action: `rollFrom.action === 'BUY'` (buy-to-close a short) is a **short-call** roll; the LEAPS-side roll (US-105) closes with a SELL. `buildPmccContributions`, `currentShortCallLeg` (a short-side chain's `ROLL_TO` opens the new short) and the `shortCallRollNumber` count all use this test, so no extra leg role or column is needed.

## Context / Why

- A roll is conceptually one action (extend the position) but two transactions (close the old contract, open the new one). Recording them as two linked legs preserves the trader's actual order tickets and lets reports show "rolled out" without inventing a synthetic phase.
- Sharing a `roll_chain_id` lets queries answer "what was the original CSP and how did it evolve?" — useful for cost-basis audits and future analytics.
- The active-leg query is phase-aware and includes `ROLL_TO` (see ADR [active-leg-resolution](./active-leg-resolution.md)); after a roll, the most recent `ROLL_TO` leg becomes the effective open option.

## Alternatives considered

- **Update the original `CSP_OPEN` leg's `expiration` and `premium` in place** — rejected; destroys history; can't reconstruct the original strike or original DTE.
- **Add a separate `rolls` join table** — rejected; the linked-leg-pair design with `roll_chain_id` is already in the initial schema and is sufficient.
- **Single composite "roll" leg** — rejected; doesn't reflect actual broker order tickets and complicates total-premium-collected math.
- **(US-104) Teach `activeLegSubquery` PMCC phases so the active-leg query finds the open short** — rejected; it must keep returning no leg for PMCC rows so the alert, polling and calendar jobs stay off them. The PMCC's open legs are instead derived by replaying its legs and chains (`currentShortCallLeg` / `currentLeapsLeg` in `pmcc-ledger.ts`).

## Consequences

- The roll service writes 2 leg INSERTs + 1 snapshot INSERT in one `db.transaction(() => { ... })()`.
- The roll cost-basis formula (`calculateRollBasis`) computes `net = newPremium − costToClose`: positive `net` reduces basis (credit), negative `net` increases basis (debit). The renderer displays this as the net-credit/debit preview during the form flow (see ADR [client-side-pnl-preview](./client-side-pnl-preview.md)).
- Roll-after-roll works correctly because the active-leg SQL query orders by `fill_date DESC, created_at DESC` and includes both `CSP_OPEN` and `ROLL_TO` leg roles. A bug here was caught during US-12 green-phase: the query was originally restricted to `CSP_OPEN` only, which broke second rolls until `ROLL_TO` was added.
- The renderer surfaces `getRollTypeLabel(currentStrike, newStrike)` as "Roll Out" / "Roll Up & Out" / "Roll Down & Out"; this lives in `src/renderer/src/lib/rolls.ts` to be shared by `RollCspForm` and `RollCspSuccess`.
- **(US-104)** All full-column leg inserts for PMCC go through one helper, `insertLegRow(db, leg: LegRecord)` in `src/main/services/leg-rows.ts` — the inverse of `readLegs`' mapping, built from `LEG_COLUMNS`. The PMCC roll service, `create-pmcc-position.ts`, the PMCC leg test fixtures and the US-103 test seam use it; the roll's insert had been "the fifth copy" of the INSERT SQL. The wheel roll/open services still hard-code their SQL (they do not build a `LegRecord` first).
- **(US-104)** A failed snapshot write rolls the two legs back — the pair and its snapshot are all-or-nothing.
- **(US-104)** The PMCC roll engine rejects a roll filled before the open short's fill date (`close_date_before_open`) and a replacement expiring on or before the roll's fill date (`expiration_not_after_fill`). Without them, the fill-date replay that finds the open short would mis-order the chain, or treat an already-expired `ROLL_TO` as the open short forever.
- **(US-104)** `RollResultBase<Phase>` is the shared result shape for every roll (`position`, `rollFromLeg`, `rollToLeg`, `rollChainId`, `costBasisSnapshot`); `RollCspResult` / `RollCcResult` are aliases and `RollPmccShortCallResult` extends it with `ledger` and `shortCallRollNumber`.

## Sources

- [extract: us-12](../../.extracts/us-12.md) — ADRs "Reuse existing `roll_chain_id` column", "Reuse existing ROLL_FROM / ROLL_TO leg roles", "Phase stays CSP_OPEN after roll", "Active-leg query must include ROLL_TO (post-review fix)"
- [extract: us-12-refactor](../../.extracts/us-12-refactor.md) — ADR "Shared Roll Domain Helpers" (`getRollTypeLabel`, `computeNetCreditDebit`)
- [extract: us-104](../../.extracts/us-104.md) — ADRs "`rollPmccShortCallPosition` writes the pair and calls US-103's writer in one transaction", "`insertLegRow` is the one full-column leg insert", "The open legs of a PMCC are derived by replaying its legs", "`RollResultBase<Phase>`"
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
- [feature: us-14-roll-cc](../../features/us-14-roll-cc.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
- [feature: us-104-roll-pmcc-short-call](../../features/us-104-roll-pmcc-short-call.md)
<!-- /generated -->
