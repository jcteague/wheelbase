# Option Wheel Manager — Final Feature Specification

_Tailored to: Alpaca API · Developer build · Tracking + active management · Classic Wheel + PMCC_

---

## The Two Strategy Modes

This is the most important design decision. Your app needs to handle two fundamentally different position structures, and they must be **kept conceptually separate** because their lifecycle, management rules, risk profile, and alert logic are completely different.

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLASSIC WHEEL                                 │
│                                                                  │
│  [Sell CSP] → assigned? → [Hold Shares] → [Sell CC] → repeat   │
│      ↓                                         ↓                │
│  expires/close                          called away / close     │
│                                                                  │
│  Capital deployed: Strike × 100 × contracts (cash secured)      │
│  Max loss: Stock goes to zero                                    │
│  Income: Recurring premiums reduce cost basis over time         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 POOR MAN'S COVERED CALL (PMCC)                  │
│                                                                  │
│  [Buy LEAPS ITM call] → [Sell near-term OTM call] → roll → ... │
│                              ↓                                  │
│                   expires/close → sell new short call           │
│                                                                  │
│  Capital deployed: Net debit of diagonal spread (much lower)   │
│  Max loss: Net debit paid (defined risk)                        │
│  Income: Recurring short call premiums reduce LEAPS cost basis  │
│  Long leg: Must always expire AFTER short leg                   │
└─────────────────────────────────────────────────────────────────┘
```

Both strategies share the same **outer shell** (a Position entity with a ticker, a lifecycle, accumulated income, and management alerts), but their **inner logic** diverges significantly. Design the data model with a `strategy_type` field and shared base fields, then strategy-specific fields for each type.

---

## Module 1: Data Model & Core Engines

This is built first and everything else sits on top of it. Getting this right is worth the time investment.

**Position Entity** (shared by both strategy types):

```
Position {
  id, ticker, strategy_type (WHEEL | PMCC)
  status (active | paused | closed)
  opened_date, closed_date
  account_id
  notes, thesis
  tags[]
}
```

**Leg Entity** (one row per discrete option transaction):

```
Leg {
  id, position_id
  leg_role (csp | short_cc | long_leaps | stock_assignment)
  action (open | close | roll_from | roll_to | expire | assign | exercise)
  option_type (call | put | stock)
  strike, expiration, contracts
  premium_per_contract   // positive = credit received, negative = debit paid
  fill_price, fill_date
  order_id               // Alpaca order ref
  roll_chain_id          // links a roll_from leg to its roll_to replacement
  greeks_at_open { delta, gamma, theta, vega, iv }
}
```

**Cost Basis Engine** — runs every time a leg is added or modified, stores a snapshot:

For the **Classic Wheel**:

```
effective_cost_basis = assignment_strike
                     - all_CSP_premiums_collected
                     - all_CC_premiums_collected
                     + all_roll_debits_paid
                     - all_roll_credits_received
```

For the **PMCC**:

```
leaps_cost_basis     = initial_leaps_debit
                     - all_short_call_premiums_collected
                     + all_roll_debits_paid
                     - all_roll_credits_received
net_cost_to_make_whole = leaps_cost_basis (goal: reduce to zero or negative)
```

**Management Rules Engine** — a set of configurable rule definitions evaluated on a schedule against every active position. Each rule has a condition function and produces a management queue item when triggered. Rules are strategy-aware.

---

## Module 2: Candidate Screener

This module answers: _"What should I wheel next?"_ and _"What would make a good PMCC?"_ It runs against the Alpaca options data API and returns a ranked list of opportunities.

### Screening Criteria for Classic Wheel Candidates

The screener needs to evaluate each candidate on a composite score derived from:

| Criterion                          | Target Range                            | Why                                                                                  |
| ---------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| **IV Rank**                        | 30–65%                                  | Rich premiums without binary event risk; above 70% usually means earnings/FDA/crisis |
| **Market Cap**                     | > $5B                                   | Tighter spreads, more liquid options chains                                          |
| **Volume (shares)**                | > 1M/day                                | Ensures you can exit the stock if assigned                                           |
| **Open Interest at target strike** | > 1,000                                 | Fills without market impact                                                          |
| **Delta at 30–45 DTE strike**      | 0.20–0.35                               | Standard income range; conservative to moderate                                      |
| **Premium yield**                  | > 1.5% / month on capital               | Annualized return floor                                                              |
| **Earnings proximity**             | > 2 weeks away                          | Avoids IV crush traps and gap risk                                                   |
| **Price**                          | User-configurable based on account size | Ensures assignment capital is manageable                                             |

The screener should pull the option chain from Alpaca for each watchlist ticker, find the contracts matching the delta/DTE target, and present ranked results sorted by risk-adjusted premium yield. The user sets their delta and DTE targets once as defaults and the screener applies them.

### Screening Criteria for PMCC Candidates

PMCC requires different conditions because you're buying a LEAPS contract and holding it for months:

| Criterion                      | Target                         | Why                                                                              |
| ------------------------------ | ------------------------------ | -------------------------------------------------------------------------------- |
| **IV environment**             | Moderate to low at LEAPS entry | You're buying time — high IV makes the long leg expensive                        |
| **Short call IV**              | Higher than long call IV       | Normal term structure; you want to sell relatively expensive short-dated premium |
| **Long call delta**            | 0.70–0.85 (deep ITM)           | Behaves like stock ownership; high intrinsic value, low extrinsic decay          |
| **Long call DTE**              | 180–500 days (LEAPS)           | Enough time to sell 4–8 rounds of short calls                                    |
| **Short call delta**           | 0.25–0.35                      | Standard OTM, probability of expiring worthless ~70%                             |
| **Short call DTE**             | 20–45 days                     | Theta decay sweet spot                                                           |
| **Net debit vs. spread width** | < 75% of strike width          | Standard efficiency check: debit of $8 on a $10-wide spread is acceptable        |
| **Trend**                      | Neutral to bullish             | PMCC loses badly in downtrends                                                   |

**Important safety check** the screener must enforce: the long call's expiration must always be later than the short call's expiration. If at any point a short call would expire after the long call, this is a naked call — the screener must flag this and prevent it.

**Screener UI**: A dedicated screen with a watchlist manager at the top (tickers you've pre-loaded for evaluation). Below it, a filtered results table showing each ticker's current candidates sorted by score. One-click promotion from "screener result" to "open position" pre-fills the trade entry form.

---

## Module 3: Position Dashboard

The command center. A single screen that gives you a complete real-time picture of every active position and surfaces anything needing attention.

**Management Queue** — the most prominent element, rendered as a prioritized action list at the top. Every item has: what the position is, what triggered the alert, and a one-click action button. Items are ordered by urgency:

1. 🔴 **Expiring this week** — position at risk of unexpected assignment or unintended expiration
2. 🔴 **Short call within 2% of strike** (PMCC) — assignment risk rising, roll consideration
3. 🟡 **Reached 50% of max profit** — standard early-close signal (reduces theta collected but eliminates late-gamma risk)
4. 🟡 **DTE ≤ 21 days** — standard roll management window
5. 🟡 **Earnings within 10 days** for any held underlying or LEAPS ticker
6. 🟡 **PMCC long leg < 60 DTE** — time to evaluate rolling the LEAPS out before it loses time value rapidly
7. 🔵 **New candidate available** — screener has found a qualifying setup matching your criteria

**Position Cards** — below the queue, one card per active position. The card adapts its display based on strategy type:

_Classic Wheel card shows:_ Ticker + current price, current phase badge (CSP / Holding / CC), strike vs. current price with visual distance bar, DTE countdown, total premium collected this wheel, effective cost basis, unrealized P&L if holding shares, and quick-action buttons (Roll, Close, Assign, Open CC).

_PMCC card shows:_ Ticker + current price, LEAPS leg details (strike, DTE, current value, delta), short call details (strike, DTE, current premium, delta), net debit paid, net credits collected to date, current position value, net P&L, and quick-action buttons (Roll Short Call, Close Entire Position).

**Portfolio Summary Bar** at the very top: total capital deployed, total premium collected MTD, total premium collected YTD, number of active wheels, number of active PMCCs, overall net delta exposure.

---

## Module 4: Trade Entry & Lifecycle Management

**Opening a Classic Wheel (CSP):**

1. Select ticker from watchlist or type any valid symbol
2. App pulls the option chain from Alpaca, filters for puts at 30–45 DTE, displays candidates sorted by delta
3. User selects a contract or types in strike/expiration manually
4. App shows: premium at mid, effective cap rate (premium / strike), probability of profit, upcoming earnings date warning if applicable
5. Confirm → creates Position + first Leg record, optionally places order via Alpaca API

**Recording assignment (Classic Wheel):**
App polls Alpaca positions API on a schedule and detects when a CSP contract disappears from options positions and 100 shares appear in equity positions. It auto-transitions the wheel to "Holding Shares" phase, updates cost basis, and pushes a notification prompting the user to open a CC.

**Opening a CC (Classic Wheel):**
Same flow as CSP but filtered for calls. App shows the user which strikes would be above their effective cost basis (required to avoid locking in a loss) and highlights those that would produce their target monthly yield.

**Rolling any position:**
Roll is modeled as a two-step atomic operation: close the existing leg at market/limit, open the replacement leg. The app records both as a linked pair (via `roll_chain_id`), nets the premium difference, and updates the cost basis snapshot. The user sees the net credit/debit of the roll upfront before confirming.

**Opening a PMCC:**

1. Select ticker
2. App shows two separate chain selectors: one filtered for deep ITM calls (delta 0.70–0.85) at 180+ DTE, one filtered for OTM calls (delta 0.25–0.35) at 20–45 DTE
3. App validates the safety constraint: long DTE > short DTE
4. App calculates and displays: net debit, max profit potential, breakeven, and the ratio of debit to spread width
5. Confirm → creates one Position with two Leg records simultaneously, optionally places as a multi-leg diagonal spread order via Alpaca API (Alpaca supports this natively)

**Rolling the PMCC short call (the most frequent operation):**
Near expiration of the short call (typically at 50% profit or 21 DTE), the user rolls it forward. Same roll logic as above but only touches the short leg — the LEAPS stays open. The app reminds the user that the new short expiration must still be before the LEAPS expiration.

**Rolling the PMCC long leg (LEAPS):**
When the LEAPS drops below ~60 DTE, the user should roll it out to maintain the long-dated anchor. App flags this, helps the user select a new LEAPS expiration, and records the close of old LEAPS and open of new LEAPS as a linked roll pair. This is also where the user may choose to roll up in strike if the stock has appreciated significantly.

---

## Module 5: Alert & Management Rules Engine

Alerts are the feature that turns this from a tracker into a genuine management assistant. The engine runs on a configurable poll interval (every 60 seconds during market hours, hourly otherwise).

### Built-in Rules (always active)

| Rule                       | Trigger                                                     | Action                               |
| -------------------------- | ----------------------------------------------------------- | ------------------------------------ |
| Expiration imminent        | DTE ≤ 5 and position still open                             | High-urgency queue item              |
| Standard management window | DTE ≤ 21                                                    | Queue item: consider rolling         |
| Profit target hit          | Current premium ≤ 50% of open premium                       | Queue item: consider closing early   |
| Assignment risk            | Underlying within 1% of CSP strike                          | Queue item: monitor closely          |
| PMCC assignment risk       | Underlying within 2% of short call strike                   | Queue item: roll or close short call |
| PMCC anchor expiring       | LEAPS DTE ≤ 60                                              | Queue item: roll LEAPS forward       |
| Earnings proximity         | Earnings date within 10 calendar days for any active ticker | Warning banner on position card      |

### User-Configurable Rules (per position or globally)

- Custom profit target % (default 50%, some traders use 25% on volatile names)
- Custom DTE management threshold (default 21, some use 14)
- Price alert: notify if underlying crosses a user-defined level
- Assignment notification: explicitly alert when Alpaca API detects assignment activity

**Notification delivery:** In-app notifications (badge on management queue) are always on. Email notifications are optional and configured via a simple SMTP setting in the app config. No external service required — just a local notification queue that the app processes.

---

## Module 6: Analytics & Performance Reporting

**Per-position P&L timeline:** A waterfall chart for each wheel showing how each leg progressively reduced the effective cost basis. For the PMCC, shows how each short call rolled down the net debit toward zero and eventually into profit.

**Income dashboard:** Monthly bar chart of total premium collected. Breakdown by strategy type (Wheel income vs. PMCC income), by ticker, and by phase (CSP premium vs. CC premium). Running YTD total prominently displayed.

**Capital efficiency report:** For each active or closed position: capital deployed, total premium collected, days active, annualized return on capital. Sorted so you can see your best and worst performers. This is the data that tells you which tickers to keep wheeling and which to retire.

**Win/loss analysis:** Win rate (position closed at profit vs. loss), average profit on wins, average loss on losses, expected value. Broken out by strategy type. Over time this tells you whether your strike selection and management rules are working.

**Strategy comparison view:** Side-by-side comparison of Wheel vs. PMCC on the same ticker, showing which approach has generated more income per dollar of capital deployed. Helps you make allocation decisions.

---

## Module 7: Alpaca Integration

Since you're a developer and Alpaca is the chosen broker, this integration is concrete and well-defined.

**Authentication:** Store API key and secret in a local `.env` file or OS keychain. Never in the database or version control. Support both paper and live environments with an easy toggle.

**Read operations (used throughout the app):**

- `GET /v2/positions` — poll every 60 seconds to detect assignments and position changes
- `GET /v2/options/contracts` — fetch option chain for screener and trade entry
- `GET /v2/options/snapshots` — get live Greeks, IV, and prices for open positions
- `GET /v2/account` — buying power, portfolio value
- `GET /v2/activities` — detect assignment events (NTA events), since Alpaca doesn't push these via websocket

**Write operations (used for order placement):**

- `POST /v2/orders` — place single-leg or multi-leg orders; Alpaca supports diagonal spreads as multi-leg orders natively
- `POST /v2/orders` with `order_class: "mleg"` for PMCC entry as a single diagonal spread order
- Real-time order status via Alpaca's websocket stream

**Important Alpaca-specific gotchas to design around:**

Assignment events are not pushed via websocket — you must poll `/v2/activities` with `activity_type=OPASN` on a schedule. The app should poll this every few minutes and cross-reference against known open positions to detect assignments automatically.

Paper trading is a completely separate API endpoint (`paper-api.alpaca.markets`) and separate credentials — the app needs a clear environment switcher so you don't accidentally send orders to live from paper mode.

---

## Module 8: Technical Architecture

**Recommended stack:**

```
Frontend:   React + Vite (fast dev server, modern bundling)
Backend:    Python FastAPI (native Alpaca SDK support)
Database:   SQLite via SQLAlchemy (local, zero infrastructure,
            easily migrated to Postgres later if needed)
Scheduler:  APScheduler (background polling for alerts and
            position sync, runs inside FastAPI process)
Broker SDK: alpaca-py (official Alpaca Python SDK)
```

**Why Python backend:** The official Alpaca SDK (`alpaca-py`) is Python-first. All the Greeks calculations and the cost basis engine benefit from numpy. FastAPI gives you async request handling and auto-generated API docs. Running the alert engine as a background task inside the same FastAPI process keeps the architecture simple — no need for Celery or Redis at this scale.

**Monorepo structure:**

```
/wheel-manager
  /backend
    /api            FastAPI routes
    /core
      lifecycle.py  Wheel Lifecycle Engine
      costbasis.py  Cost Basis Engine
      alerts.py     Management Rules Engine
      screener.py   Candidate Screener
    /integrations
      alpaca.py     Alpaca adapter (all API calls isolated here)
    /models         SQLAlchemy models
    /db             Migrations (Alembic)
  /frontend
    /src
      /components
      /pages
      /hooks        usePositions, useAlerts, useScreener
      /api          Frontend API client (calls the FastAPI backend)
  .env              API keys (gitignored)
  docker-compose.yml  Optional: containerize backend + frontend together
```

**Isolation principle:** All Alpaca API calls go through `integrations/alpaca.py`. The core engines (`lifecycle.py`, `costbasis.py`, `alerts.py`) are pure business logic with no broker dependencies. This means you can add an IBKR adapter later without touching the core.

---

## Build Phases — Recommended Order

**Phase 1 — Core engine + manual entry (Weeks 1–2)**
Build the data model, lifecycle engine, and cost basis engine with full test coverage. Add a simple React UI for manual position entry (no Alpaca yet). Validate the math is correct by entering some historical positions and verifying the cost basis calculations. This is the foundation — don't rush it.

**Phase 2 — Alpaca read integration + live dashboard (Weeks 3–4)**
Connect to Alpaca read-only. Pull live prices, Greeks, and option snapshots for open positions. Build the dashboard with real-time position cards. Set up the background polling for assignment detection. End of phase: the app auto-updates when prices move and detects assignments.

**Phase 3 — Alert engine + screener (Weeks 5–6)**
Build the Management Rules Engine and the candidate screener. Add the management queue UI. Wire up the screener to Alpaca option chains. End of phase: the app is telling you what needs attention each morning and surfacing new trade ideas.

**Phase 4 — Order execution + PMCC support (Weeks 7–9)**
Add write access to Alpaca for order placement. Build the PMCC-specific entry flow and rolling logic. Add the PMCC-specific alert rules (LEAPS anchor DTE, short call assignment risk). End of phase: full end-to-end workflow for both strategies from within the app.

**Phase 5 — Analytics (Week 10+)**
Income dashboard, capital efficiency report, win/loss analysis. These are high-value but don't block the core workflow — you need enough trade history first to make them meaningful anyway.

---

## Critical Design Decisions to Make Before Writing Code

**Decision 1: Where is the app's source of truth?**

Option A is _Alpaca is the source of truth_ — the app syncs from Alpaca on startup and after every operation, and your local database is just a cache plus the metadata Alpaca doesn't store (notes, roll history, cost basis calculations). This is simpler but means historical data disappears if a position is closed in Alpaca without going through your app. Option B is _local DB is the source of truth_ — every position is created and managed through your app, with Alpaca as the execution layer only. This gives you richer historical data and the ability to model positions before placing them, but requires discipline to always go through your app.

**Recommendation: Option B with a reconciliation layer.** Your app owns the position records. A daily reconciliation job compares Alpaca positions against your DB and flags discrepancies so you can investigate.

**Decision 2: How should rolls be modeled?**

Option A: A roll is two separate legs (close + open) linked by a `roll_chain_id`. This gives maximum flexibility and audit trail. Option B: A roll mutates the existing leg record. This is simpler but loses the history of what was originally traded.

**Recommendation: Option A.** The full transaction history is the most valuable long-term asset of this app — never overwrite it.
