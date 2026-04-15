# Epic: Execute Orders via Broker

## Phase

Phase 4

## Goal

A trader can place single-leg and multi-leg orders directly through the app via Alpaca's write API, eliminating the need to switch to the broker platform for execution. Order status is tracked in real-time.

## Success Criteria

- Trader can place a single-leg order (sell to open CSP, buy to close, sell to open CC) from any trade entry or management form
- Trader can place a multi-leg order for PMCC entry (diagonal spread) as a single atomic order
- Roll orders execute as a linked close + open pair
- Order status updates in real-time via Alpaca websocket stream
- Filled orders automatically create the corresponding Leg records and update cost basis
- Unfilled or rejected orders display clear error messaging
- Paper vs. live environment is prominently displayed on every order confirmation screen
- Order confirmation step shows: order details, estimated fill price, and an explicit confirm/cancel

## Vertical Slice

| Layer       | What ships                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Integration | alpaca.py: place_order(), place_multi_leg_order(), subscribe_order_updates()                                                 |
| Backend     | Order status tracking, websocket listener for fill events, auto-create Leg on fill                                           |
| API         | POST /api/orders, GET /api/orders/:id/status                                                                                 |
| Frontend    | Order placement buttons on trade forms, order confirmation dialog, order status indicator, environment badge on confirmation |

## Stories

- [ ] US-69: Place a single-leg sell-to-open order (CSP or CC) via Alpaca
- [ ] US-70: Place a buy-to-close order from the position management UI
- [ ] US-71: Place a roll as a linked close + open order pair
- [ ] US-72: Place a multi-leg diagonal spread order for PMCC entry
- [ ] US-73: Track order status in real-time via Alpaca websocket
- [ ] US-74: Auto-create Leg records and update cost basis when orders fill
- [ ] US-75: Display order confirmation dialog with estimated fill and environment badge
- [ ] US-76: Handle order rejection with clear error messaging

## Dependencies

- Epic 06: Live Market Data (Alpaca connection established)
- Epic 01-03: Trade entry and roll forms (UI to attach order placement to)
- Epic 09: PMCC Strategy (multi-leg order support)

## Strategy

Both

## Out of Scope

- Automated order placement (no human confirmation) — future
- Order modification after submission — future
- Bracket or conditional orders — future
