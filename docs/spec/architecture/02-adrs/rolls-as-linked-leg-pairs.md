# ADR: Rolls are stored as linked ROLL_FROM / ROLL_TO leg pairs
<!-- generated:from us-12 -->

## Decision

A CSP roll is recorded as **two new legs**, written in the same transaction, sharing a freshly minted `roll_chain_id` (UUID):

- `ROLL_FROM` leg: `action = 'BUY'` (buy-to-close), `strike = currentStrike`, `expiration = currentExpiration`, `premium_per_contract = costToClosePerContract`.
- `ROLL_TO` leg: `action = 'SELL'` (sell-to-open), `strike = newStrike ?? currentStrike`, `expiration = newExpiration`, `premium_per_contract = newPremiumPerContract`.

The original `CSP_OPEN` leg is never mutated. The `positions` row is not updated — `phase` stays `CSP_OPEN`. A new `cost_basis_snapshots` row records the net effect of the roll. The `legs.roll_chain_id` column already exists from migration 001.

This is the canonical immutable-history pattern called out by the CLAUDE.md architecture rules: "Rolls are always stored as linked leg pairs, never in-place updates."

## Context / Why

- A roll is conceptually one action (extend the position) but two transactions (close the old contract, open the new one). Recording them as two linked legs preserves the trader's actual order tickets and lets reports show "rolled out" without inventing a synthetic phase.
- Sharing a `roll_chain_id` lets queries answer "what was the original CSP and how did it evolve?" — useful for cost-basis audits and future analytics.
- The active-leg query is phase-aware and includes `ROLL_TO` (see ADR [active-leg-resolution](./active-leg-resolution.md)); after a roll, the most recent `ROLL_TO` leg becomes the effective open option.

## Alternatives considered

- **Update the original `CSP_OPEN` leg's `expiration` and `premium` in place** — rejected; destroys history; can't reconstruct the original strike or original DTE.
- **Add a separate `rolls` join table** — rejected; the linked-leg-pair design with `roll_chain_id` is already in the initial schema and is sufficient.
- **Single composite "roll" leg** — rejected; doesn't reflect actual broker order tickets and complicates total-premium-collected math.

## Consequences

- The roll service writes 2 leg INSERTs + 1 snapshot INSERT in one `db.transaction(() => { ... })()`.
- The roll cost-basis formula (`calculateRollBasis`) computes `net = newPremium − costToClose`: positive `net` reduces basis (credit), negative `net` increases basis (debit). The renderer displays this as the net-credit/debit preview during the form flow (see ADR [client-side-pnl-preview](./client-side-pnl-preview.md)).
- Roll-after-roll works correctly because the active-leg SQL query orders by `fill_date DESC, created_at DESC` and includes both `CSP_OPEN` and `ROLL_TO` leg roles. A bug here was caught during US-12 green-phase: the query was originally restricted to `CSP_OPEN` only, which broke second rolls until `ROLL_TO` was added.
- The renderer surfaces `getRollTypeLabel(currentStrike, newStrike)` as "Roll Out" / "Roll Up & Out" / "Roll Down & Out"; this lives in `src/renderer/src/lib/rolls.ts` to be shared by `RollCspForm` and `RollCspSuccess`.

## Sources

- [extract: us-12](../../.extracts/us-12.md) — ADRs "Reuse existing `roll_chain_id` column", "Reuse existing ROLL_FROM / ROLL_TO leg roles", "Phase stays CSP_OPEN after roll", "Active-leg query must include ROLL_TO (post-review fix)"
- [extract: us-12-refactor](../../.extracts/us-12-refactor.md) — ADR "Shared Roll Domain Helpers" (`getRollTypeLabel`, `computeNetCreditDebit`)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
