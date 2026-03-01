# Option Wheel Manager — Comprehensive Feature Specification

*Informed by: research into CoveredWheel, WingmanTracker, TrackTheta, broker API capabilities (Alpaca & IBKR), and gaps in existing tools.*

---

## Broker API Comparison: What This Means for Your App

Before the features, understanding what each API offers shapes everything:

| Capability | Alpaca | IBKR (TWS) |
|---|---|---|
| **Developer friendliness** | REST API, clean Python SDK, simple auth | Socket-based TCP protocol, more complex setup |
| **Options support** | Level 1–3, single & multi-leg, CSPs & CCs natively | Full options suite, all strategies |
| **Order placement via API** | Yes — market, limit, stop | Yes — full order types |
| **Real-time market data** | Yes, up to 1,000 calls/min, Greeks included | Yes, streaming via TWS socket |
| **Assignment events** | Poll REST API (no websocket push) | Available but requires TWS to be running |
| **Paper trading** | Built-in, free, full API parity | Simulated accounts available |
| **Commission** | Free for retail | $0.15–$0.65/contract |
| **Practical consideration** | Best choice if you use or can move to Alpaca | More powerful but requires TWS running locally |

**Recommendation for your build:** Design the app with Alpaca as the primary integration (cleaner API, free commissions, better DX), with IBKR as a secondary adapter pattern. The app's internal data model should be broker-agnostic so you can swap or add brokers without rebuilding the core.

---

## Architecture Concept

The app has three conceptual layers that need to be designed cleanly:

```
┌─────────────────────────────────────────────┐
│              USER INTERFACE                  │
│   Dashboard · Position Detail · Analytics    │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│              CORE APPLICATION               │
│  Wheel Lifecycle Engine · Cost Basis Engine │
│  Alert Engine · P&L Calculator              │
└──────┬─────────────────────────┬────────────┘
       │                         │
┌──────▼──────┐         ┌────────▼──────────┐
│  LOCAL DATA │         │  BROKER ADAPTERS  │
│  Store/DB   │         │  Alpaca · IBKR    │
└─────────────┘         └───────────────────┘
```

The Wheel Lifecycle Engine is the heart of the app — it's what makes this different from a generic options tracker.

---

## Feature Modules

### Module 1: Wheel Lifecycle Engine *(Core — build first)*

This is the foundational concept that every other feature builds on. A **Wheel** is a named entity tied to a single underlying ticker. It persists across all legs, all rolls, all assignments, and all covered calls until it is deliberately closed. Every trade is a *leg* of a wheel, not a standalone event.

The engine needs to track and enforce these phase transitions:

```
[NEW WHEEL]
     ↓
[CSP OPEN] ──── expires worthless ───→ [CSP CLOSED - Profit]
     │
     └── assigned ───→ [SHARES HELD]
                              ↓
                       [CC OPEN] ──── expires worthless ──→ [CC CLOSED - Profit]
                              │
                              └── called away ──→ [SHARES CALLED AWAY]
                                                        ↓
                                               [WHEEL COMPLETE]
                                               or [NEW CSP on same ticker]
```

At every stage the engine automatically calculates:

- **Effective cost basis** = strike price − all premiums collected + all debits paid on rolls
- **Total premium collected** across the entire wheel lifecycle
- **Unrealized P&L** = (current underlying price − effective cost basis) × shares, for the assignment phase
- **Days active** for the wheel overall and for each individual leg
- **Annualized return** = (total premium / capital deployed) × (365 / days active)

---

### Module 2: Position Dashboard *(Core — build second)*

A single-screen view of all active wheels with live data populated from the broker API. Each row shows the ticker, current phase badge, the current underlying price vs. strike price with a visual distance indicator (e.g., a progress bar showing how close the price is to the strike), DTE countdown, premium collected this cycle, effective cost basis, and a quick-action button for the most logical next step (Roll, Close, Assign, Open CC).

The dashboard needs two view modes: **Card view** (one card per wheel showing the full lifecycle arc visually) and **Table view** (dense, sortable, for power users managing many positions). Key portfolio-level metrics live at the top: total deployed capital, total premium collected MTD/YTD, number of active wheels, overall portfolio delta, and a heat map of positions by urgency.

**Live data refresh** should poll the Alpaca API on a configurable interval (default: every 60 seconds during market hours) to update underlying prices, option mid-prices, and Greeks. The app should clearly show when data was last refreshed and whether the market is open.

---

### Module 3: Position Entry & Management *(Core — build third)*

**Opening a new CSP:** Enter ticker, strike, expiration, contracts, premium received, and the app pre-fills the rest from live data. If connected to Alpaca, it can pull the option chain directly and let you select the contract from a filtered list.

**Recording assignment:** The app detects — or prompts you to confirm — when a CSP moves ITM approaching expiration. On assignment, it automatically transitions the wheel to "Shares Held" phase, sets the new cost basis, and prompts you to consider opening a CC.

**Opening a CC:** Same flow as CSP, but on the shares you now hold. The app suggests a strike above your effective cost basis so you won't lock in a loss if called away, and shows the yield at each strike.

**Rolling a position:** This is the trickiest operation. Rolling means closing the current leg (at a debit or credit) and simultaneously opening a new one. The app should handle this as a single atomic operation: record the close price of the existing leg, record the open price of the new leg, net the premium difference, and update the cumulative cost basis. Both the roll-out (same strike, later expiration) and roll-and-adjust (different strike) patterns need to be supported.

**Closing early:** Record a buy-to-close at a price less than the original premium, calculate the realized profit on that leg, and prompt whether to open a new position immediately or mark the wheel as resting.

---

### Module 4: Active Management & Alerts *(High value — build fourth)*

This is what separates the app from a journal and makes it a management tool.

**The Management Queue** is a dedicated view — prominently placed, maybe always visible as a sidebar — that shows every position needing attention today, ranked by urgency:

- Positions expiring within 7 days with no roll/close plan
- Positions that have reached 50% of max profit (standard early-close rule)
- Positions where the underlying has crossed within 2% of the strike
- Any assigned positions where you've held shares for more than X days without a CC
- Earnings events within 5 days for held underlyings

Each item in the queue has a one-click action button that opens a pre-filled order ticket.

**Alert rules** should be user-configurable per position: notify me when this position hits 50% profit, notify me when DTE drops below 21, notify me when the stock price crosses a threshold. Notifications delivered in-app first, with optional email if you set it up.

**Earnings calendar integration** is critical for the wheel — selling puts or calls into earnings without knowing the date is a common costly mistake. The app should flag earnings dates automatically for any ticker you're wheeling and warn you before you open or hold a position through an earnings event.

---

### Module 5: Analytics & Reporting *(Important — build fifth)*

**Per-Wheel P&L Drilldown:** A full timeline of every leg in a wheel's history — strike, premium, outcome, dates, cost basis at each stage — displayed as a waterfall chart showing how premium collection has progressively reduced the effective cost basis over time. This is the single most satisfying view for a wheel trader to see working.

**Portfolio Income Report:** Monthly and YTD premium collected, broken down by ticker and by phase (CSP income vs. CC income). Average DTE at open and close. Win rate. Average premium per day (theta collected). These numbers tell you whether your wheel selections are actually performing.

**Capital Allocation View:** Which tickers are deployed, how much capital each is using, what annualized return each is generating. This lets you make data-driven decisions about which wheels to keep running and which to retire.

**Strategy Performance:** Over time, were your CSPs too aggressive (getting assigned often) or too conservative (too far OTM, low premium)? Visualizing your historical delta at open vs. assignment rate helps calibrate future strike selection.

---

### Module 6: Order Execution *(Advanced — build last, requires broker connection)*

With Alpaca connected, the app should be able to place orders directly from the management queue or position detail screens — without the user needing to switch to the broker interface. This is the feature that transforms the app from a tracker into a command center.

For the wheel specifically, the key executable actions are: sell-to-open a CSP, buy-to-close an option, sell-to-open a CC, and a "roll" composite action that sends a buy-to-close and sell-to-open as a multi-leg order simultaneously.

All order placement requires an explicit confirmation step — show the order details, current bid/ask, estimated fill price, and make the user click Confirm. Never place orders automatically without human confirmation. Order status (pending → filled → rejected) should feed back into the position record immediately.

For IBKR, this requires TWS or IB Gateway to be running locally and connected — the app should handle the connection gracefully and warn clearly when TWS is not detected.

---

### Module 7: Watchlist & Candidate Pipeline *(Enhancement)*

A separate section for tickers you're *considering* but haven't wheeled yet. For each candidate, the app pulls: current price, 52-week range, IV rank (current IV relative to its historical range), upcoming earnings date, and dividend dates (relevant because early assignment risk increases around ex-dividend for CCs).

You can annotate each candidate with why it's interesting, your target entry price, and your preferred strike/expiration criteria. When you're ready to enter, one click converts the watchlist item into a new wheel and pre-populates the order form.

---

## Data Model — Key Entities

Getting this right before writing code is essential:

- **Wheel** — `id, ticker, status (active/closed), opened_date, closed_date, account_id, notes`
- **Leg** — `id, wheel_id, leg_type (csp/cc/stock), action (open/close/assignment/expiration), strike, expiration, contracts, premium, fill_price, fill_date, order_id (broker ref), roll_of_leg_id`
- **CostBasisSnapshot** — `id, wheel_id, date, basis_per_share, total_premium_collected, note` — recalculated every time a leg is added
- **Alert** — `id, wheel_id, alert_type, threshold, triggered, notification_sent`
- **Account** — `id, broker (alpaca/ibkr), credentials_ref, nickname`
- **PriceCache** — `ticker, last_price, last_updated` — local cache of live prices to avoid hammering the API

---

## Suggested Build Phases

**Phase 1 — Foundation (Weeks 1–3):** Data model, Wheel Lifecycle Engine, cost basis calculations, manual entry only. No broker connection yet. Prove the core logic is right before adding complexity. End state: you can manually enter all your positions and see accurate cost basis and P&L.

**Phase 2 — Dashboard & UI (Weeks 4–6):** Build the dashboard, position detail views, and the management queue. Add read-only Alpaca connection for live price data. End state: you have a real-time view of all positions with live prices.

**Phase 3 — Alerts & Analytics (Weeks 7–9):** Management alerts, earnings calendar, income reporting, per-wheel P&L drilldown. End state: the app is proactively telling you what needs attention each morning.

**Phase 4 — Order Execution (Weeks 10–12):** Write-enabled broker connection, order placement, roll execution, status callbacks. End state: you can manage positions entirely from within the app.

---

## Open Questions to Decide Before Building

**Web app vs. desktop app?** A web app (React + backend API) is accessible anywhere but requires hosting and a backend for secure credential storage. A desktop app (Electron or Tauri) can store broker credentials locally and connect to IBKR's TWS directly, which is much simpler for IBKR integration.

**Where does your data live?** Local SQLite (simple, private, no hosting) vs. a cloud database (accessible from multiple devices, requires a backend). Given you're handling brokerage credentials, local-first is worth strong consideration.

**What stack?** If you're a developer, Python with FastAPI + a React frontend is a natural fit given Alpaca's Python SDK. If you want to move faster, a Next.js app with direct API calls from the client (Alpaca supports CORS) is a simpler starting point.
