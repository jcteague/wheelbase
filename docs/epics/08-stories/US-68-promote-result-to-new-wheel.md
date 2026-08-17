# US-68: Promote a screener result to the new wheel form with pre-filled fields

**As a** wheel trader who found a good candidate in the screener,
**I want** one click to open the new-wheel form pre-filled from that result,
**So that** I don't re-key the ticker, strike, expiration, and premium — and I can confirm against a fresh quote before recording the trade.

---

## Context

The screener's value is the bridge from "this is the best candidate" to actually opening the wheel. Promoting a result pre-fills the new-wheel form so the trader confirms rather than retypes. But option quotes are point-in-time snapshots: by the time the trader reviews and submits, the mark may have moved. So the pre-filled premium is an **editable default**, the form re-fetches a fresh quote on open, and a non-blocking banner warns when the price has moved materially. Promote never places or records a trade on its own — it lands the trader in the existing form (US-1 / `newWheelSchema`) for confirmation.

---

## Acceptance Criteria

```gherkin
Background:
  Given the screener shows an AAPL candidate: $180 put, expiring 2026-08-21,
    mark $2.70, delta 0.28, quoted at 10:42:15

Scenario: Promote pre-fills the new-wheel form
  When the trader clicks "Promote to trade" on the AAPL row
  Then the new-wheel form opens
  And ticker is "AAPL", strike is "180", expiration is "2026-08-21"
  And premium per contract is pre-filled with "2.70"
  And contracts defaults to 1
  And the capital required shows $18,000 (180 × 100 × 1)

Scenario: Pre-filled premium is editable, not locked
  Given the form was promoted with premium $2.70
  When the trader changes premium per contract to "2.65"
  Then the form accepts the edit

Scenario: Submitting records the edited premium
  Given the trader changed the premium per contract to "2.65"
  When the trader submits the form
  Then the recorded trade shows premium per contract $2.65, not the screener snapshot

Scenario: A fresh quote is shown when the form opens
  Given the promoted mark was $2.70 quoted at 10:42:15
  And the current mark for AAPL's $180 put is $2.68
  When the new-wheel form opens
  Then the snapshot time updates to the fresh quote's time
  And the premium field still shows the promoted "2.70"

Scenario: Warn when the price has moved materially
  Given the promoted mark was $2.70
  When the form re-fetches and the current mark is $2.50
  Then a non-blocking banner shows "Price moved: quoted $2.70 → now $2.50 — review before submitting"
  And the premium field still shows the promoted "2.70"
  And the trader can still submit after reviewing

Scenario Outline: Warn when the market is not open
  Given the market status pill reads <status>
  When the trader promotes a result
  Then the form flags the pre-filled mark as a stale after-hours snapshot

  Examples:
    | status |
    | CLOSED |
    | EXT    |

Scenario: Form still works when the fresh quote can't be fetched
  Given the market data provider is unavailable
  When the trader promotes the AAPL result
  Then the form opens with the promoted values pre-filled
  And a banner shows "Couldn't refresh quote — showing screener snapshot from 10:42:15"
  And the trader can still submit

Scenario: Promote never auto-submits
  When the trader clicks "Promote to trade"
  Then no position is created until the trader submits the form
```

---

## Technical Notes

- Pre-fill maps the screener result onto `newWheelSchema` (`src/renderer/src/schemas/new-wheel.ts`): `ticker`, `strike`, `expiration`, `contracts` (default 1), `premiumPerContract` (the snapshot mark). `fillDate`, `thesis`, and `notes` are left for the trader; a promoted candidate may seed `thesis` from the watchlist note (US-69) if present.
- Carry a `quotedAt` timestamp with the promoted payload; show it on the form.
- On form open, re-fetch the contract's mark via the Massive adapter and reconcile: show the "price moved" banner (non-blocking) only when the deviation exceeds `max($0.05, 5% of the promoted mark)` — both the tick-noise floor and the relative test must be exceeded. A nickel move on a $2.70 mark is routine bid-ask bounce; the $0.05 floor exists to keep sub-$1.00 premiums from triggering on noise, not as an independent trigger.
- The re-fetch **never overwrites the premium field**: the pre-filled value stays the promoted mark (the trader records their actual fill); the fresh mark and time appear in the banner/provenance strip only.
- If the re-fetch fails, degrade to the promoted snapshot plus a "couldn't refresh" notice — never block the form (per the [alert-evaluation-failure-isolation ADR](../../spec/architecture/02-adrs/alert-evaluation-failure-isolation.md) pattern for boundary I/O).
- Respect `MarketStatusPill` (LIVE/EXT/CLOSED): when CLOSED **or** EXT, mark the snapshot stale — equity options don't trade extended hours, so an EXT mark is just the 4:00 close while the underlying keeps moving.
- Structural fields (ticker, strike, expiration, contracts) are pre-filled but **remain editable**, exactly like the normal US-1 form — promote never locks fields; only market-derived values (premium, delta, underlying price, spread) are treated as volatile snapshots.
- SQLite remains the source of truth: the trade records what the trader confirms, not the screener snapshot.

---

## Out of Scope

- Placing the order via broker (Epic 10)
- Promoting into a PMCC entry flow (Epic 09)
- Editing the strike/expiration on the form to a contract the screener didn't surface (allowed by the normal form, just not pre-filled by promote)
- Bid-ask spread width warning on the promoted form (candidate for a future story — a mark on a wide spread is unreliable)
- Earnings-in-window flag on the promoted form (US-70 covers the screener side)

---

## Dependencies

- US-66: ranked results provide the row to promote
- US-1: new-wheel form / `newWheelSchema` to promote into
- US-39: Massive adapter for the fresh-quote reconciliation
- US-69 (optional): watchlist note seeds `thesis` when present — degrade to empty thesis if absent

---

## Estimate

5 points

## Mockup

`mockups/us-68-promote-to-trade.mdx`
