# Epic: Broker Integration

## Phase

Phase 4

## Goal

Everything that touches the trader's broker account lives here: placing orders through the
broker, and keeping the journal in step with what the broker account did on its own.

A trader with a broker connected can place single-leg and multi-leg orders from the app, and
events the broker reports — fills, expirations, assignments — are recorded automatically. A
trader with no broker connected loses none of the app: every one of those events can still be
entered by hand through the manual stories in Epics 01–03 and 09. The broker automates a
journal entry; it is never the only way to make one.

## Principles

- **The broker is optional.** Each automatic path in this epic has a manual counterpart that
  ships first and keeps working. Nothing here may gate a feature on broker credentials.
- **SQLite is the source of truth.** A broker event becomes legs and a cost-basis snapshot
  through the same services the manual entry uses, so the two paths cannot disagree.
- **Automatic when unambiguous, confirmed when not.** An event with one possible journal entry
  (an option expiring worthless) is recorded without asking. An event with a choice the broker
  activity does not settle (how a PMCC assignment was covered) pre-fills the manual sheet for
  the trader to confirm.
- **Account facts only.** This epic uses `BrokerProvider` (`getAccountInfo`, `getActivities`,
  and the order methods it adds). Market facts stay on `MarketDataProvider`.

## Success Criteria

### Order execution

- Trader can place a single-leg order (sell to open CSP, buy to close, sell to open CC) from any trade entry or management form
- Trader can place a multi-leg order for PMCC entry (diagonal spread) as a single atomic order
- Roll orders execute as a linked close + open pair
- Order status updates in real-time via Alpaca websocket stream
- Filled orders automatically create the corresponding Leg records and update cost basis
- Unfilled or rejected orders display clear error messaging
- Paper vs. live environment is prominently displayed on every order confirmation screen
- Order confirmation step shows: order details, estimated fill price, and an explicit confirm/cancel

### Account activity

- An option that expires worthless is recorded automatically from broker activity, for wheel and PMCC positions
- An assignment is detected from broker activity for every short option the journal tracks: a CSP (shipped), a covered call being called away, and a PMCC short call
- A detected PMCC assignment is recorded automatically when the broker activity shows how it was settled, and otherwise opens US-111's sheet pre-filled
- A detected event the trader already entered by hand is recognised and not recorded twice
- With no broker connected, none of the above runs and every event remains available as a manual entry

## Vertical Slice

| Layer       | What ships                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Integration | `alpaca-broker.ts`: place order, place multi-leg order, order-update stream; activity types beyond `OPASN` (expirations)     |
| Main        | Order status tracking, fill listener, auto-create Leg on fill; activity detectors on the scheduler, one per event kind       |
| IPC         | Order placement and status channels; detected-event channels alongside the existing assignment ones                          |
| Renderer    | Order placement buttons on trade forms, order confirmation dialog, order status indicator, environment badge on confirmation |

## Stories

### Order execution

- [ ] US-69: Place a single-leg sell-to-open order (CSP or CC) via Alpaca
- [ ] US-70: Place a buy-to-close order from the position management UI
- [ ] US-71: Place a roll as a linked close + open order pair
- [ ] US-72: Place a multi-leg diagonal spread order for PMCC entry
- [ ] US-73: Track order status in real-time via Alpaca websocket
- [ ] US-74: Auto-create Leg records and update cost basis when orders fill
- [ ] US-75: Display order confirmation dialog with estimated fill and environment badge
- [ ] US-76: Handle order rejection with clear error messaging

### Account activity

- [ ] US-124: Detect a PMCC short call expiring or being assigned from broker activity and record it
- [ ] US-125: Detect a wheel option expiring worthless or a covered call being called away from broker activity and record it

Already shipped under Epic 06 and the scheduler: CSP assignment detection (`detect-assignments`,
polling `OPASN` activities for `CSP_OPEN` positions). US-124 and US-125 extend that pattern; they
do not replace it.

US-124 and US-125 are reserved here and not yet authored. Author them in Linear when this epic
is ported; the manual stories they automate are US-119 and US-111 (PMCC) and US-9 and US-10
(wheel).

## Dependencies

- Epic 06: Live Market Data (Alpaca connection, `BrokerProvider`, the polling scheduler)
- Epic 01-03: Trade entry and roll forms (UI to attach order placement to), and the wheel's manual expiration and call-away entries
- Epic 09: PMCC Strategy (multi-leg order support; US-119 and US-111 are the manual entries US-124 automates; US-109 shows a short past expiration as `Outcome not recorded` until either path records it)

## Strategy

Both

## Out of Scope

- Automated order placement (no human confirmation) — future
- Order modification after submission — future
- Bracket or conditional orders — future
- Importing an existing broker account's positions or history into the journal — future
