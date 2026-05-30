# US-37 (revised): Configure separate Massive (market data) and Alpaca (broker) credentials with a broker paper/live toggle

**As a** wheel trader,
**I want** to configure my Massive API key and my Alpaca paper + live credentials separately, and always see which broker environment I'm operating against,
**So that** I never confuse paper trading data with live portfolio values, and I can use the app for market data even before I've connected a broker.

---

## Context

Wheelbase now uses two vendors with different concerns and different environment models:

- **Massive** (market data) — single API key, no paper/live distinction. The same key serves quotes, Greeks, and option chains.
- **Alpaca** (broker) — separate API key + secret per environment. `paper-api.alpaca.markets` and `api.alpaca.markets` are entirely different accounts.

The original US-37 modelled a single environment toggle that reinitialised "the provider." That conflated two independent things. This revision treats credentials per vendor:

1. Massive credential is a one-time setup. Without it, no live market data.
2. Alpaca credentials are paired (paper + live); the environment toggle picks which set is active. Without either, market data still works — the app degrades gracefully on broker-only surfaces.
3. The environment badge tracks **broker environment** (Alpaca paper vs live). It is not affected by Massive — Massive doesn't have one.

**Why PAPER is louder than LIVE.** The PAPER badge is intentionally more prominent than the LIVE badge. Wheelbase's expected steady state is live wheel management; PAPER is a transient/exceptional state used for app testing or strategy experiments. A loud LIVE badge habituates within days and stops conveying meaning. A loud PAPER badge signals an unusual context every single time it appears — exactly when the trader needs the reminder that decisions here don't propagate to a real account. Do not "fix" this inversion without rereading this paragraph.

**Position-broker mismatch is a known gap addressed via warnings, not data tagging.** Positions in Wheelbase are journaled manually and are not synchronised with any broker account. When the trader switches broker environments, position entries remain unchanged. The LIVE confirmation warns about reconciliation; a future story will tag legs with the env they were recorded under.

---

## Acceptance Criteria

```gherkin
Background:
  Given the settings page lives at route #/settings
  And it has two top-level sections: "Market Data (Massive)" and "Broker (Alpaca)"

Scenario: Settings page surfaces both vendors independently
  When the trader opens settings
  Then the Massive section shows one API key field (masked) and a "Test connection" button
  And the Broker section shows two credential cards — "Paper" and "Live" — each with API Key ID, Secret Key (masked), and "Test connection"
  And a global toggle "Active Broker Environment: Paper | Live" sits above the broker credential cards

Scenario: Saving Massive credentials enables market data
  Given no Massive API key is configured
  When the trader pastes a key and clicks "Save"
  Then the key is encrypted via Electron safeStorage and stored
  And a "Test connection" round-trip succeeds
  And the position list begins fetching live prices on next refresh

Scenario: Test connection for Massive uses a fixed reference probe
  Given a candidate API key
  When the trader clicks "Test connection" in the Massive section
  Then the app calls GET /v3/reference/tickers/AAPL with the candidate key
  And shows green "Connected" on HTTP 200
  And shows red "Authentication failed (401)" on HTTP 401
  And shows red "Rate limited — please try again" on HTTP 429
  And the probe ticker is hard-coded (not user-supplied) so the test is deterministic

Scenario: Test connection for Alpaca surfaces the account identifier and environment
  Given a candidate Alpaca key id + secret entered in the Paper credential card
  When the trader clicks "Test connection"
  Then the app calls GET /v2/account against paper-api.alpaca.markets
  And on success shows green "✓ Verified — Account PA…ABC (paper)"
  And accountNumberMasked is first 2 chars + "…" + last 3 chars of the account number
  And the test does not import any activities

Scenario: Test connection detects environment mismatch
  Given Alpaca live keys entered in the Paper credential card
  When the trader clicks "Test connection"
  Then the request to paper-api.alpaca.markets returns 401
  And the UI shows red "Environment mismatch — these are LIVE keys, not paper keys"
  And the keys are not saved

Scenario: Switching broker environment to LIVE requires confirmation
  Given the active broker environment is Paper
  When the trader flips the toggle to Live
  Then a confirmation dialog opens with the title "Switch to LIVE Alpaca account?"
  And the body reads: "From now on, Wheelbase will read buying power, cash, and broker activities from your real money Alpaca account. Activity polling switches to live; existing paper-account activities will no longer be checked."
  And the dialog lists, as bullets:
    - "Header changes from amber PAPER to green LIVE"
    - "Buying power, cash, activities — all switch to your live account"
    - "Positions in Wheelbase are not synchronized — your journal entries remain exactly as you recorded them"
    - "Phase 4 order execution will route to live when enabled"
  And the footer reads: "Market data is unaffected — Massive continues to supply prices."
  And the confirm button is the standard gold primary button (not destructive red)

Scenario: LIVE confirmation includes position-reconciliation warning when positions exist
  Given the trader has 1 or more open positions in Wheelbase
  When the LIVE confirmation dialog opens
  Then an amber warning line above the buttons reads: "You have {N} open positions in Wheelbase. Verify each one matches an actual contract in your live Alpaca account before acting on it."

Scenario: Confirming the switch reinitialises only the BrokerProvider
  Given the trader confirms the switch to Live
  Then the BrokerProvider is reinitialised with live credentials
  And the broker badge in the header changes from "PAPER" to "LIVE"
  And TanStack Query keys prefixed "broker:*" are invalidated
  And TanStack Query keys prefixed "market:*" are NOT invalidated
  And in-flight market data requests continue uninterrupted

Scenario: Switching back to Paper is immediate
  Given the active broker environment is Live
  When the trader flips the toggle to Paper
  Then the switch happens immediately with no confirmation
  And the badge updates to "PAPER"

Scenario: Broker environment badge is always visible and clearly distinguished
  When the active broker environment is Paper
  Then the header shows a high-visibility amber badge "PAPER" on every page
  When the active broker environment is Live
  Then the header shows a more subtle green badge "LIVE" on every page
  And no badge changes appearance based on Massive's connection state

Scenario: Market data is independent of broker configuration
  Given Massive is configured and connected
  And no Alpaca credentials are configured (neither paper nor live)
  When the trader opens the position list
  Then live prices, mids, and Greeks render normally from Massive
  And surfaces that depend on the broker (buying power, activities) show "Connect Alpaca to enable" placeholder
  And the broker badge in the header reads "NO BROKER" with neutral grey background and tooltip "Alpaca not configured. Click to set up."

Scenario: Credentials are stored securely per vendor
  When the trader saves any credential
  Then it is encrypted via safeStorage.encryptString before storage
  And it never appears in SQLite or log files
  And the UI shows "••••••••" for any saved secret on next page load
  And the user can click "Replace" to enter a new value (no decryption-into-UI)
  And whitespace is trimmed from pasted keys before storage

Scenario: App remembers the last active broker environment between launches
  Given the trader last used Paper
  When they close and reopen the app
  Then the app starts in Paper
  And the badge reads "PAPER" immediately

Scenario: Empty-state on first launch
  Given no Massive and no Alpaca credentials are configured
  When the trader opens the app
  Then a setup banner reads: "Connect Massive to enable live market prices, Greeks, and option chains. Connect Alpaca to track buying power and broker activities. Massive provides data; Alpaca provides your account. Both are optional — only Massive is required to view market data."
  And both links route to the settings page
  And the position list shows "—" for all live data columns

Scenario: Removing Massive credentials disables market data with stale fallback
  When the trader clicks "Remove" in the Massive section and confirms
  Then the stored key is deleted from safeStorage
  And open position cards continue to show the last cached price with a "stale" badge until next render, then "—" with an inline "Configure Massive" link
  And subsequent quote / snapshot requests throw MarketDataAuthError

Scenario: Expired Massive or Alpaca credentials surface a re-entry prompt
  Given saved Massive or Alpaca credentials authenticate successfully at startup
  When a subsequent request returns 401 mid-session
  Then a toast appears: "{Vendor} authentication failed — check your key in Settings"
  And the badge for that vendor degrades (Massive dot grey, broker badge "NO BROKER" until re-saved)
```

---

## Technical Notes

- New page: `SettingsPage` at `#/settings` (already planned in original US-37; layout updates).
- New IPC channels:
  - `settings:get-credential-status` → `{ massive: "configured" | "missing", alpacaPaper: ..., alpacaLive: ..., activeBrokerEnv: "paper" | "live" | "none" }`
  - `settings:save-massive-key` → `{ key }` (trim whitespace before storage)
  - `settings:remove-massive-key`
  - `settings:save-alpaca-credentials` → `{ environment: "paper" | "live", keyId, secret }`
  - `settings:remove-alpaca-credentials` → `{ environment }`
  - `settings:set-active-broker-environment` → `{ environment: "paper" | "live" }`, reinitialises `BrokerProvider`
  - `settings:test-connection` → `{ vendor: "massive" | "alpaca", environment? }` returns `{ ok, errorCode?, accountNumberMasked? }`
- Provider reinitialisation: factory functions for `MarketDataProvider` (one Massive instance, replaced on key change) and `BrokerProvider` (one Alpaca instance, replaced on environment switch). No cross-coupling.
- Query invalidation: scope invalidation to vendor — broker env switch invalidates only queries whose `queryKey[0]` is `broker:*`; Massive replacement invalidates `market:*` keys.
- Renderer: `EnvironmentBadge` reads only broker state; `MarketDataStatusDot` (small green/grey dot near the badge) reads Massive connection state.
- Test connection for Massive tests REST only; WebSocket auth (auth-message-after-connect) is tested when streaming ships.
- First-connect activities ingestion is bounded by the caller (test-connection does not import; scheduled collection bounds to "since today" or earliest position created_at).
- Optional cheap mitigation: write the current broker environment to `legs.created_in_env` at insert time so a future position-tagging story has data from day one.
- Trim whitespace on every pasted credential before validation; reject if validation fails.

---

## Out of Scope

- Multiple market data providers active simultaneously (US-39 ships only Massive; switching back to Alpaca for market data is not supported).
- Account balance dashboard (separate story).
- Per-environment SQLite databases — a single DB serves both; only the live data differs.
- Automatic broker environment detection from order history.
- Tagging each Wheelbase position with the broker environment it was recorded under, plus a "Paper position" chip on cards when the active environment differs — separate story.
- Settings opt-out: "I execute trades outside Wheelbase — hide the broker badge" — separate story.
- Multi-account live Alpaca support.

---

## Dependencies

- US-31 (rewrite) — provider interface definitions
- US-39 — `MassiveMarketDataProvider` (the thing being configured)
- US-40 — `AlpacaBrokerProvider` (the thing being toggled)

---

## Estimate

8 points (up from 5 — two vendors, more IPC, scoped invalidation, reconciliation warnings)

## Mockup

- `mockups/us-37-credentials-and-broker-environment.mdx`
