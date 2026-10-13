# ADR: Rolls are stored as linked ROLL_FROM / ROLL_TO leg pairs

<!-- generated:from us-12,us-104,us-105 -->

## Decision

A CSP roll is recorded as **two new legs**, written in the same transaction, sharing a freshly minted `roll_chain_id` (UUID):

- `ROLL_FROM` leg: `action = 'BUY'` (buy-to-close), `strike = currentStrike`, `expiration = currentExpiration`, `premium_per_contract = costToClosePerContract`.
- `ROLL_TO` leg: `action = 'SELL'` (sell-to-open), `strike = newStrike ?? currentStrike`, `expiration = newExpiration`, `premium_per_contract = newPremiumPerContract`.

The original `CSP_OPEN` leg is never mutated. The `positions` row is not updated — `phase` stays `CSP_OPEN`. A new `cost_basis_snapshots` row records the net effect of the roll. The `legs.roll_chain_id` column already exists from migration 001.

This is the canonical immutable-history pattern called out by the CLAUDE.md architecture rules: "Rolls are always stored as linked leg pairs, never in-place updates."

**PMCC short-call roll (US-104).** The same shape applies to a PMCC's short call. `rollPmccShortCallPosition` writes a `ROLL_FROM` / `BUY` / `CALL` leg (the open short's strike, expiration and contracts; `premium_per_contract = fill_price = costToClosePerContract`) and a `ROLL_TO` / `SELL` / `CALL` leg (replacement strike and expiration; `newPremiumPerContract`), sharing one fresh `roll_chain_id`, plus exactly one `cost_basis_snapshots` row — appended by US-103's `appendPmccSnapshot` with `triggerEvent = 'PMCC_SHORT_ROLL'` — all in one `db.transaction`. The PMCC roll computes no basis of its own; the ledger nets the chain (`SELL − BUY`). The `positions` row is untouched (`phase` stays `PMCC_OPEN`, `updated_at` not bumped, parity with the wheel CC roll). Both legs write `fees = '0.0000'` (no fees input), as wheel rolls do. No migration was needed.

**Short vs LEAPS chains.** A PMCC can hold rolls on either side. A chain is classified by its `ROLL_FROM` leg's action: `rollFrom.action === 'BUY'` (buy-to-close a short) is a **short-call** roll; the LEAPS-side roll (US-105) closes with a SELL. `buildPmccContributions`, `currentShortCallLeg` (a short-side chain's `ROLL_TO` opens the new short), `currentLeapsLeg` (a long-side chain's `ROLL_TO` is the newest long BUY) and the `shortCallRollNumber` / `leapsRollNumber` counts all use this test (`isShortCallRoll`), so no extra leg role or column is needed.

**PMCC LEAPS roll (US-105) — the inverted pair.** `rollPmccLeapsPosition` writes a `ROLL_FROM` / **`SELL`** / `CALL` leg (the open LEAPS' strike, expiration and contracts; `premium_per_contract = fill_price = proceedsPerContract`) and a `ROLL_TO` / **`BUY`** / `CALL` leg (replacement strike and expiration; `replacementDebitPerContract`), sharing one fresh `roll_chain_id`, plus one `PMCC_LEAPS_ROLL` snapshot from `appendPmccSnapshot`, in one transaction. The same netting (`SELL − BUY`) reads the pair as a credit when the proceeds exceed the debit; the `ROLL_TO` becomes the open LEAPS and re-anchors the effective share cost. The position row and any open short call are untouched. Both PMCC rolls now share one write path, `recordPmccRoll` (`src/main/services/pmcc-roll-record.ts`): it builds both `LegRecord`s from `{ from, to, contracts, fillDate, triggerEvent }`, inserts them through `insertLegRow` and appends the snapshot inside one `db.transaction`, so the pair's shape is defined once for either direction.

## Context / Why

- A roll is conceptually one action (extend the position) but two transactions (close the old contract, open the new one). Recording them as two linked legs preserves the trader's actual order tickets and lets reports show "rolled out" without inventing a synthetic phase.
- Sharing a `roll_chain_id` lets queries answer "what was the original CSP and how did it evolve?" — useful for cost-basis audits and future analytics.
- The active-leg query is phase-aware and includes `ROLL_TO` (see ADR [active-leg-resolution](./active-leg-resolution.md)); after a roll, the most recent `ROLL_TO` leg becomes the effective open option.

## Alternatives considered

- **Update the original `CSP_OPEN` leg's `expiration` and `premium` in place** — rejected; destroys history; can't reconstruct the original strike or original DTE.
- **(US-105) Record the LEAPS roll as `LEAPS_CLOSE` + a new `LEAPS_OPEN`** — rejected; it breaks "rolls are always linked leg pairs" and the chain netting US-103 built for exactly this case.
- **(US-105) A second copy of the PMCC roll transaction in the LEAPS service** — rejected in Refactor; the two services differed only in the actions, the trigger and the chain filter, so the body was extracted into `recordPmccRoll`.
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
- **(US-105)** The pair is its own type, `RollLegPair<From extends LegAction = 'BUY', To extends LegAction = 'SELL'>`, and `RollResultBase<Phase, From, To>` extends it. `RollPmccLeapsResult extends RollResultBase<'PMCC_OPEN', 'SELL', 'BUY'>` adds `ledger` (`PmccLedgerWithStrike`) and `leapsRollNumber`; `recordPmccRoll` returns `AppendPmccSnapshotResult<T> & RollLegPair<From, To>`. The defaults keep every existing result unchanged.
- **(US-105)** The LEAPS roll engine rejects a roll filled after the current LEAPS' expiration (`close_date_after_expiration`) or before the position's last recorded event (`before_last_event`, against `latestFillDate(legs)`), and a replacement expiring on or before the fill (`expiration_not_after_fill`). The last-event rule is stricter than US-104's `close_date_before_open` (which it replaced for the LEAPS roll; the short roll keeps its own): a roll back-dated before _any_ later leg would sort before it in the replay, leave the latest snapshot stale and have the coverage rules judge the wrong short.
- **(US-105)** Both PMCC roll services share `loadPmccRollContext` (load + open-legs guard), `logPmccRollRejection` and `recordPmccRoll` (`pmcc-roll-record.ts`), number rolls with `nextPmccRollNumber(legs, 'short' | 'leaps')` (`pmcc-ledger.ts`) and format money with `money4` (`leg-rows.ts`).
- **(US-105)** The shared writer logs DEBUG `pmcc_roll_tx_start` / `pmcc_roll_tx_committed { positionId, rollChainId, triggerEvent }` for both PMCC rolls.

## Sources

- [extract: us-12](../../.extracts/us-12.md) — ADRs "Reuse existing `roll_chain_id` column", "Reuse existing ROLL_FROM / ROLL_TO leg roles", "Phase stays CSP_OPEN after roll", "Active-leg query must include ROLL_TO (post-review fix)"
- [extract: us-12-refactor](../../.extracts/us-12-refactor.md) — ADR "Shared Roll Domain Helpers" (`getRollTypeLabel`, `computeNetCreditDebit`)
- [extract: us-104](../../.extracts/us-104.md) — ADRs "`rollPmccShortCallPosition` writes the pair and calls US-103's writer in one transaction", "`insertLegRow` is the one full-column leg insert", "The open legs of a PMCC are derived by replaying its legs", "`RollResultBase<Phase>`"
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
- [feature: us-14-roll-cc](../../features/us-14-roll-cc.md)
- [feature: us-103-pmcc-cost-basis](../../features/us-103-pmcc-cost-basis.md)
- [extract: us-105](../../.extracts/us-105.md) — ADRs "`rollPmccLeapsPosition` writes the inverted pair through a shared PMCC roll writer", "A dedicated payload schema and a pair-generic `RollResultBase`"
- [feature: us-104-roll-pmcc-short-call](../../features/us-104-roll-pmcc-short-call.md)
- [feature: us-105-roll-pmcc-leaps](../../features/us-105-roll-pmcc-leaps.md)
<!-- /generated -->
