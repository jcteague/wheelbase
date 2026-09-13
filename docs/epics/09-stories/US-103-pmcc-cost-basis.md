# US-103: Calculate and display PMCC cost basis

**As a** PMCC trader collecting short-call credits against a long LEAPS,
**I want to** see what the LEAPS still costs me after every credit, roll, and fee,
**So that** I know how much is actually at risk and how close the position is to paying for itself.

**Epic:** [09 — PMCC Strategy End-to-End](../09-pmcc-strategy.md)  
**Phase:** 4  
**Strategy:** PMCC  
**Priority:** Owns the PMCC cost-basis formula; the PMCC lifecycle stories consume it  
**Status:** Ready for product review

## Context

A PMCC has no shares and no assignment strike, so the wheel's `assignment_strike − premiums` formula does not apply. What a PMCC trader tracks instead is the running net cost of the long call: the LEAPS debit reduced by every short-call credit and adjusted by the net cash of every roll. That number is the amount still at risk, and driving it to zero — a "free" LEAPS — is the explicit goal of running the cycle.

[US-101](US-101-open-pmcc-position.md) computes an initial net debit for the entry review and shows it once on the saved position. It is a snapshot of entry, not a running figure: the moment a short call expires and another is sold, or either leg is rolled, the entry number is stale. This story owns the running calculation, its recalculation after every leg event, its stored audit chain, and its display.

**Ownership.** This story defines the PMCC cost-basis formula and its labels. [US-104](../09-pmcc-strategy.md) (short-call roll), [US-105](../09-pmcc-strategy.md) (LEAPS roll), [US-111](../09-pmcc-strategy.md) (short-call assignment), and [US-115](../09-pmcc-strategy.md) (subsequent short call) record legs and trigger recalculation; none of them restates the formula or its messages. Those stories are consumers, not prerequisites — this story ships against the two opening legs US-101 creates and stays correct as each leg event lands.

Cost basis here is a **cash ledger of recorded fills**. It never depends on a live quote, so it is always available. The open short call's credit is cash already received and counts, but it is not profit — the obligation is still open — and the display must keep that distinction visible. Marking either open leg to market is a separate valuation story.

## Acceptance Criteria

```gherkin
Background:
  Given the valuation date is 2026-09-14 in America/New_York
  And XYZ is a PMCC opened on 2026-09-14 with one XYZ $80 LEAPS call expiring 2027-09-17, bought at $25.00 per share
  And it has one XYZ $110 short call expiring 2026-10-16, sold at $2.00 per share
  And all leg fees are $0.00 unless the scenario says otherwise

Scenario: Cost basis after the two opening legs
  When the trader opens the PMCC detail page
  Then the cost-basis panel shows "Cost basis" $23.00 per share and $2,300.00 total
  And it shows "LEAPS cost to date" $25.00 per share and "Short-call credits to date" -$2.00 per share
  And it shows "Effective share cost if exercised" $103.00, named as the $80.00 LEAPS strike plus $23.00
  And it shows "Premium recovered" 8.0% of the LEAPS cost to date
  And it shows no maximum profit, no breakeven at the short expiration, and no annualized return

Scenario: Distinguish the open short-call credit from realized credits
  When the trader opens the PMCC detail page
  Then the $200.00 short-call credit is listed as open, not as realized or as profit
  And the panel does not use the wheel's share cost-basis label or show a share count

Scenario: A short call that expires worthless realizes its credit without moving cost basis
  Given the XYZ $110 short call expires worthless on 2026-10-16
  When the trader opens the PMCC detail page
  Then the cost basis is still $23.00 per share and $2,300.00 total
  And the $200.00 credit is listed as realized
  And the position shows no open short call

Scenario: A subsequent short call lowers cost basis
  Given the XYZ $110 short call expired worthless
  When a new XYZ $108 short call expiring 2026-11-20 is sold at $1.80 per share
  Then the cost basis becomes $21.20 per share and $2,120.00 total
  And "Short-call credits to date" becomes $3.80 per share
  And "Effective share cost if exercised" becomes $101.20

Scenario: A short-call roll contributes one net line, not two gross lines
  Given the open XYZ $108 short call expiring 2026-11-20 was sold at $1.80 per share
  When it is rolled by closing it at $3.00 per share and selling an XYZ $112 call expiring 2026-12-18 at $2.40 per share
  Then the cost basis becomes $21.80 per share and $2,180.00 total
  And the history shows one line "Short-call roll #1 debit" of $0.60 per share
  And it does not show separate gross close and open lines for that roll

Scenario: A LEAPS roll applies its net cash and re-anchors the effective share cost
  Given the cost basis is $21.80 per share against the open XYZ $80 LEAPS call
  When the LEAPS is rolled by closing it at $26.00 per share and buying an XYZ $85 call expiring 2028-01-21 at $23.50 per share
  Then the cost basis becomes $19.30 per share and $1,930.00 total
  And "LEAPS cost to date" becomes $22.50 per share
  And "Effective share cost if exercised" becomes $104.30, named as the new $85.00 strike plus $19.30
  And no separate strike-difference adjustment is applied to the cost basis

Scenario: Credits that exceed the LEAPS cost show a free position
  Given the LEAPS cost to date is $22.50 per share and short-call credits to date are $22.90 per share
  When the trader opens the PMCC detail page
  Then the cost basis shows -$0.40 per share and -$40.00 total
  And the panel shows "LEAPS fully paid for by credits"
  And "Premium recovered" shows 101.8%
  And the negative basis is shown as a negative amount, not clamped to zero

Scenario: Cost basis is per share of contract regardless of quantity
  Given the PMCC was opened with three contracts on each leg at the same per-share fills
  When the trader opens the PMCC detail page
  Then the cost basis shows $23.00 per share and $6,900.00 total

Scenario: Fees are counted once, in the leg that incurred them
  Given the opening LEAPS leg had $1.00 of total fees and the opening short leg had $1.00 of total fees
  When the trader opens the PMCC detail page
  Then the cost basis shows $23.02 per share and $2,302.00 total
  And each fee appears once in the history, attached to its own leg

Scenario: The audit chain records one snapshot per leg event
  Given the PMCC has recorded the opening legs, the short-call expiration, a subsequent short call, a short-call roll, and a LEAPS roll
  When the trader reviews the cost-basis history
  Then five snapshots appear in chronological order with their trigger events
  And their cost bases read $23.00, $23.00, $21.20, $21.80, and $19.30 per share

Scenario: A failed leg event leaves no cost-basis change
  Given the cost basis is $23.00 per share
  And a storage failure occurs while recording a new short call
  When the trader reopens the PMCC detail page
  Then the cost basis is still $23.00 per share
  And no snapshot was recorded for the failed event
  And no partial leg appears in the history

Scenario: Leave a classic wheel unaffected
  Given a classic wheel holds 100 assigned shares with a $46.50 per-share cost basis
  When the trader opens that position's detail page
  Then it shows the existing wheel cost basis and premium waterfall unchanged
  And no PMCC cost-basis panel or effective share cost appears
```

## UI Changes

### Cost-basis panel on the PMCC detail page

- Add a **Cost basis** `SectionCard` to the PMCC detail page introduced by US-101, below the two leg-reference panels.
- Lead with the running figure as a per-share amount and a total: **Cost basis $19.30 / share · $1,930.00**. Caption the multiplier once (100 shares per contract × contracts) rather than repeating it on every row.
- Show the two subtotals that always reconcile to it, so the number is auditable at a glance:

  | Row                        | Example    | Meaning                                                          |
  | -------------------------- | ---------- | ---------------------------------------------------------------- |
  | LEAPS cost to date         | $22.50     | Long-leg debits and fees, net of cash received on long-leg rolls |
  | Short-call credits to date | −$3.20     | Short-leg credits and roll nets, after fees                      |
  | **= Cost basis**           | **$19.30** | What the LEAPS still costs, and the amount still at risk         |

- Show **Effective share cost if exercised** as the current long strike plus the per-share basis, naming the strike it used ($85.00 + $19.30 = $104.30). Re-anchor it to the new strike after a LEAPS roll. Label it as the cost of acquiring shares through the LEAPS, not as a guaranteed breakeven.
- Show **Premium recovered** as short-call credits to date over LEAPS cost to date. It exceeds 100% once the position is free.
- When cost basis is zero or negative, show **LEAPS fully paid for by credits** and keep rendering the negative amount as negative. Use the `wb-*` accent tokens for that state; do not style the panel with the P&L red/green convention — a cost is not a gain or loss.

### History rows

- List one row per leg event with its date, description, per-share and total contribution, and the running cost basis after it. Reuse the existing leg-history and waterfall styling from US-11/US-15.
- Render a roll as a single net row — "Short-call roll #1 debit $0.60", "LEAPS roll #1 credit $2.50" — matching the wheel's roll-net precedent from US-16, not as gross close and open rows.
- Mark the currently open short call's credit as **open**; mark expired and closed short-call credits as **realized**. Neither label may read as profit.

### Positions list

- The PMCC row's "Initial net debit" cell from US-101 becomes the current **Cost basis** total, so the list stops showing a stale entry figure once cycles have run. The original entry debit remains visible as the first row of the detail history.
- Wheel rows, their cost-basis cell, and the wheel detail page are unchanged.

## Technical Notes

- Add the PMCC calculation as a pure function in `src/main/core/costbasis.ts` alongside the wheel formulas: it takes an ordered list of per-share contributions with their leg roles and contract counts and returns basis per share, total basis, LEAPS cost to date, and credits to date. No DB, broker, or logging imports, per the core-engine rule.
- The formula is a cash ledger over recorded fills: `basis_per_share = long_debits + fees − short_credits ± roll_nets`. There is no assignment strike and no share count.
- **Do not apply the wheel's CSP strike-delta term to a LEAPS roll.** A long-leg strike change is already priced into that roll's net cash; adding `newStrike − prevStrike` on top double-counts it — the mirror image of the US-16 AC8 bug. The strike change surfaces through the effective-share-cost line, which reads the open long leg's strike, not through the basis.
- Roll pairs are grouped by `roll_chain_id` into one synthetic net contribution per chain, ordered by `fill_date`, exactly as `groupRollsByChain` does in `src/main/services/assign-csp-position.ts`. US-16 left that helper private "until a second service needs it" — this is the second consumer, so extract it to a shared service helper rather than writing a third copy. Keep the chain grouping in the service layer; the engine stays unaware of storage layout.
- Recalculate inside the same service-layer SQLite transaction as the leg event that triggered it, so a failed event leaves neither a leg nor a snapshot. Persist to the existing `cost_basis_snapshots` table: `basis_per_share` (may be negative — the column is TEXT), `total_premium_collected` for short-call credits to date, and `trigger_event` from migration 004. No new migration is expected; confirm during planning that no PMCC-specific column is needed rather than adding one speculatively.
- Use `decimal.js` with `ROUND_HALF_UP` and the existing 4 dp TEXT convention. Keep per-share and per-contract units explicit: $25.00 per share is $2,500.00 per standard contract. Round for display only.
- Fees belong to the leg that incurred them and enter the ledger once. US-101's initial net debit already includes opening fees; this calculation must reproduce $2,302.00 for that example rather than adding them a second time.
- Percentages are display-only. `Premium recovered` is undefined when LEAPS cost to date is zero or negative — show the free-position state instead of dividing.
- Renderer: reuse `SectionCard` and the existing history/table primitives, with Tailwind utilities and `wb-*` tokens. `SummaryRow` still carries pre-existing inline styles; reuse it as-is and write new markup with Tailwind rather than extending that pattern.
- Only PMCC positions render this panel. Wheel cost-basis code paths, snapshots, and display must be untouched.
- INFO: recalculated basis per leg event with its trigger. DEBUG: ordered contributions, roll-chain nets, and transaction checkpoints. No logging in the core engine.
- Tests should cover the pure function (entry, expiration, subsequent short call, short roll credit and debit, LEAPS roll, negative basis, multi-contract, fees), roll-chain grouping, the snapshot chain across a full cycle, transactional rollback on a failed event, and a wheel-position regression proving its basis is unchanged.

## Out of Scope

- Live or unrealized P&L, marking either open leg to market, and any value derived from a quote. Cost basis is a cash ledger; the combined PMCC valuation story supplies market-based numbers.
- Maximum profit, breakeven at the short expiration, and annualized return. With different expirations these depend on assumptions about the remaining LEAPS value and volatility, as US-101 established.
- Recording the leg events themselves: subsequent short calls (US-115), the short-call roll (US-104), the LEAPS roll (US-105), and short-call assignment (US-111). Each triggers this recalculation as it lands; none redefines the formula.
- Final realized P&L on closing the whole position, and portfolio-level aggregation of PMCC basis across positions.
- Alerts driven by cost basis or by the short strike sitting below the effective share cost.
- Tax lots, wash sales, and holding-period treatment.
- Editing, backdating, or correcting already-recorded fills.

## Dependencies

- [US-101: Open a PMCC position with two linked opening legs](US-101-open-pmcc-position.md) supplies the two opening legs, the entry debit this calculation must reproduce, the fee convention, and the detail page this panel is added to. Ships first.
- [Epic 03](../03-roll-positions.md) supplies the linked close/open roll-pair model and `roll_chain_id`.
- [US-16: Cost basis through sequential rolls](../../spec/features/us-16-cost-basis-sequential-rolls.md) supplies the roll-net waterfall precedent and the `groupRollsByChain` helper to extract.
- US-104, US-105, US-111, and US-115 consume this calculation at their own service boundaries. They are not prerequisites.

## Estimate

5 points. One pure formula plus snapshot persistence and one display panel, on a data model that already exists. The risk is in the roll cases, not the arithmetic: getting the LEAPS-roll cash right without the wheel's strike-delta term, and keeping the recalculation inside the leg event's transaction.

## Domain Review

Reviewed using the options-expert skill.

- PMCC cost basis is the running net cost of the long call — `initial_leaps_debit − short_call_credits + roll_debits − roll_credits` — not a share cost basis. There is no assignment strike and no stock. Reducing it to zero or below is the explicit goal of the cycle, which is why the running figure and the recovered percentage both matter more than the entry debit.
- Traders need the second number as well: the long strike plus the per-share basis is what shares would actually cost if the LEAPS were exercised, and it is the honest reference point against the underlying and against the short strike. A short strike below that figure means a call-away locks in a loss on the diagonal. Surfacing that comparison as a warning belongs to the alert stories, not here.
- The open short call's credit is real cash and belongs in the ledger, but the obligation is still open and buying it back can cost more than was collected. Realized and open credits are therefore labeled separately, consistent with US-101's refusal to present opening credit as earned profit.
- A LEAPS roll that changes strike must not take a wheel-style strike-delta adjustment. Rolling up in strike extracts cash and simultaneously worsens the effective share cost; both effects follow from the roll's actual cash and the new strike anchor. Applying a strike delta to the basis as well would double-count the change.
- The cost basis is the amount still at risk if both legs expire worthless. It is the PMCC analogue of max loss, but it is a cash figure, not a live risk number, and it assumes no further credits are collected.
- Maximum profit and breakeven at the short expiration remain non-displayable for the reason US-101 gave: with different expirations they depend on the remaining long call's value and implied volatility. See the [Fidelity / Cboe diagonal-spread guide](https://www.fidelity.com/learning-center/investment-products/options/options-strategy-guide/long-diagonal-spread-calls).

## Mockup

[US-103 PMCC cost-basis mockup](../../../mockups/us-103-pmcc-cost-basis.mdx). Step through the lifecycle states to watch the panel, the history rows, and the effective share cost re-anchor after the LEAPS roll. Render with the existing `pnpm mockups` viewer.
