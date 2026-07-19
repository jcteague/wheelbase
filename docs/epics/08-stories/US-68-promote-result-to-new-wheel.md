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
  And the trade will record $2.65 when submitted

Scenario: A fresh quote is fetched when the form opens
  Given the promoted mark was $2.70 quoted at 10:42:15
  When the new-wheel form opens and re-fetches AAPL's $180 put
  And the current mark is $2.68
  Then the snapshot time updates to the fresh quote

Scenario: Warn when the price has moved materially
  Given the promoted mark was $2.70
  When the form re-fetches and the current mark is $2.50
  Then a non-blocking banner shows "Price moved: quoted $2.70 → now $2.50 — review before submitting"
  And the trader can still submit after reviewing

Scenario: Warn when the market is closed
  Given the market status pill reads CLOSED
  When the trader promotes a result
  Then the form flags the pre-filled mark as a stale after-hours snapshot

Scenario: Promote never auto-submits
  When the trader clicks "Promote to trade"
  Then no position is created until the trader submits the form
```

---

## Technical Notes

- Pre-fill maps the screener result onto `newWheelSchema` (`src/renderer/src/schemas/new-wheel.ts`): `ticker`, `strike`, `expiration`, `contracts` (default 1), `premiumPerContract` (the snapshot mark). `fillDate`, `thesis`, and `notes` are left for the trader; a promoted candidate may seed `thesis` from the watchlist note (US-69) if present.
- Carry a `quotedAt` timestamp with the promoted payload; show it on the form.
- On form open, re-fetch the contract's mark via the Massive adapter and reconcile: if the fresh mark deviates > 5% **or** > $0.05 from the promoted mark, show the "price moved" banner (non-blocking).
- Respect `MarketStatusPill`: when CLOSED/EXT, mark the snapshot stale — after-hours option marks are unreliable.
- Structural fields (ticker, strike, expiration, contracts, capital) are stable; only market-derived values (premium, delta, underlying price, spread) are treated as volatile snapshots.
- SQLite remains the source of truth: the trade records what the trader confirms, not the screener snapshot.

---

## Out of Scope

- Placing the order via broker (Epic 10)
- Promoting into a PMCC entry flow (Epic 09)
- Editing the strike/expiration on the form to a contract the screener didn't surface (allowed by the normal form, just not pre-filled by promote)

---

## Dependencies

- US-66: ranked results provide the row to promote
- US-1: new-wheel form / `newWheelSchema` to promote into
- US-39: Massive adapter for the fresh-quote reconciliation

---

## Estimate

5 points

## Mockup

`mockups/us-68-promote-to-trade.mdx`
