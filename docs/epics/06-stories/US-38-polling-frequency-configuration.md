# US-38: Configure polling frequency for market hours, extended hours, and closed market

**As a** wheel trader who wants live data without unnecessary resource usage,
**I want the** app to poll at different frequencies depending on whether the market is open, in extended hours, or closed,
**So that** I get timely updates when they matter and the app is efficient when they don't.

---

## Context

The app needs background polling for three data feeds: stock quotes, option snapshots, and broker activity (assignment detection). Polling frequency should adapt to market conditions — 60-second updates during regular hours when prices move, 5-minute updates during extended hours when only the underlying trades (options don't), and on-demand-only when the market is fully closed.

The polling scheduler is the central orchestrator that knows the market calendar, manages intervals, and dispatches data-fetch and detection jobs. The renderer uses TanStack Query `refetchInterval` tied to the current market session, while the main process runs the detection jobs on its own timer.

---

## Acceptance Criteria

```gherkin
Background:
  Given the app is running and the MarketDataProvider is configured

Scenario: Regular market hours — poll every 60 seconds
  Given the current time is 10:30 AM ET on a trading day
  When the polling scheduler evaluates the market status
  Then stock quote polling runs every 60 seconds
  And option snapshot polling runs every 60 seconds
  And assignment detection polling runs every 60 seconds

Scenario: Extended hours — reduce polling frequency
  Given the current time is 5:00 PM ET (after-hours session)
  When the polling scheduler evaluates the market status
  Then stock quote polling runs every 300 seconds (5 minutes)
  And option snapshot polling is paused (options don't trade in extended hours)
  And assignment detection polling runs every 300 seconds

Scenario: Pre-market session — same as extended hours
  Given the current time is 7:00 AM ET (pre-market session)
  When the polling scheduler evaluates the market status
  Then stock quote polling runs every 300 seconds
  And option snapshot polling is paused
  And assignment detection runs every 300 seconds

Scenario: Market closed — poll on app launch only
  Given the current time is 10:00 PM ET on a Friday (market closed)
  When the polling scheduler evaluates the market status
  Then all periodic polling is paused
  And data is refreshed once on app launch
  And data refreshes when the trader manually triggers a refresh

Scenario: Transition from closed to pre-market
  Given polling was paused (market closed)
  When the market enters pre-market session (4:00 AM ET)
  Then the scheduler resumes stock quote polling at 300-second interval
  And assignment detection resumes at 300-second interval
  And a log entry records: "Market session changed: closed → pre"

Scenario: Manual refresh button forces immediate data fetch
  Given the market is closed and periodic polling is paused
  When the trader clicks the refresh button on the position list
  Then all data feeds refresh immediately (stock quotes, option snapshots)
  And the "last updated" timestamp updates

Scenario: Market holiday is treated as closed
  Given today is a US market holiday (e.g., Memorial Day)
  And it is a Monday at 11:00 AM ET
  When the polling scheduler evaluates the market status
  Then all periodic polling is paused (same as weekend)

Scenario: Settings page shows current polling status
  When the trader navigates to the settings page
  Then the "Market Data" section shows:
    | Field                | Value                        |
    | Market Status        | Open (Regular Session)       |
    | Quote Interval       | 60s                          |
    | Option Interval      | 60s                          |
    | Detection Interval   | 60s                          |
    | Last Updated         | 2 seconds ago                |

Scenario: Polling intervals are configurable with guardrails
  When the trader adjusts the regular-hours polling interval on the settings page
  Then the minimum allowed value is 30 seconds
  And the maximum allowed value is 600 seconds (10 minutes)
  And the default is 60 seconds
```

---

## Technical Notes

- **Polling scheduler:** `src/main/services/polling-scheduler.ts` — main-process service that:
  1. Checks market status via `provider.getMarketStatus()` every 60s
  2. Maintains a `currentSession` state (regular | pre | post | closed)
  3. On session change, adjusts `setInterval` timers for each data feed
  4. Dispatches: stock quote fetch, option snapshot fetch, assignment detection
- **Market calendar:** The `getMarketStatus()` call from the adapter returns `{ isOpen, nextOpen, nextClose, session }`. The scheduler uses `session` to select intervals. For holidays, the API reports `isOpen: false` and `session: "closed"` even on weekdays.
- **Interval configuration storage:** `settings` table with keys: `poll_interval_regular` (default 60), `poll_interval_extended` (default 300). Stored as integers (seconds).
- **Renderer polling:** TanStack Query hooks (`useStockQuotes`, `useOptionSnapshots`) receive their `refetchInterval` from a `usePollingInterval()` hook that reads the current market session from `useMarketStatus()`.
- **New IPC channels:**
  - `market-data:polling-status` — returns current intervals, session, and last-update timestamps
  - `market-data:refresh` — triggers an immediate refresh of all feeds
  - `settings:get-polling-config` / `settings:set-polling-config` — read/write polling intervals
- **Manual refresh:** Add a refresh icon button in the `PositionsListPage` header. Clicking it calls `market-data:refresh` and invalidates all TanStack Query caches.
- **App launch refresh:** On main-process startup, run one immediate poll cycle for all feeds regardless of market status, so the trader always sees recent data when they open the app.

---

## Out of Scope

- WebSocket streaming (future — polling is sufficient for Phase 2)
- Per-position polling intervals
- Notification when market opens/closes
- Polling for non-Alpaca data sources

---

## Dependencies

- US-31 (MarketDataProvider adapter — `getMarketStatus()` method)
- US-37 (environment toggle — polling uses the active environment's provider)

---

## Estimate

5 points

## Mockup

- `mockups/us-38-polling-status.mdx` (settings page section)
