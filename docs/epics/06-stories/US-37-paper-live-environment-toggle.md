# US-37: Toggle between paper and live broker environments with clear visual indicator

**As a** wheel trader who uses both paper and live trading accounts,
**I want to** easily switch between paper and live environments and always know which one I'm connected to,
**So that** I never accidentally confuse paper trading data with live portfolio values.

---

## Context

Alpaca (and most brokers) maintain completely separate paper and live environments with different API endpoints and credentials. A trader developing their strategy might use paper trading for weeks before going live. The environment distinction is critical — confusing paper prices or positions with real money is a serious UX failure. The spec explicitly calls this out: "the app needs a clear environment switcher so you don't accidentally send orders to live from paper mode."

This story provides a settings screen to configure credentials for each environment, a global environment indicator that's always visible, and a toggle to switch between them. Switching environments reinitializes the MarketDataProvider with the appropriate credentials.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has configured both paper and live Alpaca credentials

Scenario: Environment indicator is always visible in the app header
  When the trader is using the paper environment
  Then a prominent badge in the top navigation bar reads "PAPER" with an amber background
  And the badge is visible on every page (position list, detail, new wheel form)

Scenario: Live environment indicator is visually distinct
  When the trader is using the live environment
  Then the badge reads "LIVE" with a green background
  And the badge is more subtle than the paper badge (paper should scream, live is normal)

Scenario: Settings page allows configuring credentials for each environment
  When the trader navigates to the settings page
  Then there are two credential sections: "Paper Trading" and "Live Trading"
  And each section has fields for API Key ID and Secret Key
  And the secret key field is masked (password type)
  And a "Test Connection" button validates the credentials

Scenario: Test connection verifies credentials against the broker
  Given the trader enters paper credentials
  When they click "Test Connection"
  Then the app calls getAccountInfo() with those credentials
  And shows a green checkmark and "Connected — Paper account" on success
  And shows a red error message on failure: "Authentication failed — check your API key and secret"

Scenario: Switching environment reinitializes the provider
  Given the trader is in the paper environment
  When they select "Live" from the environment toggle
  Then a confirmation dialog appears: "Switch to LIVE environment? All market data will refresh."
  And on confirming, the MarketDataProvider reinitializes with live credentials
  And the environment badge updates to "LIVE"
  And all TanStack Query caches are invalidated (prices refresh)

Scenario: Switching to live requires confirmation, switching to paper does not
  Given the trader is in the live environment
  When they select "Paper" from the environment toggle
  Then the switch happens immediately (no confirmation needed)
  And the badge updates to "PAPER"

Scenario: Credentials are stored securely
  When the trader saves their credentials
  Then API keys are stored in the OS keychain (via Electron safeStorage)
  And credentials never appear in the SQLite database or log files
  And the settings page shows "••••••••" for saved secret keys

Scenario: App launches with no credentials configured
  Given no Alpaca credentials have been saved
  When the trader opens the app
  Then a setup prompt appears: "Connect your Alpaca account to enable live market data"
  And the prompt links to the settings page
  And all live data columns show "—" (graceful degradation)

Scenario: App remembers the last active environment
  Given the trader was using the paper environment
  When they close and reopen the app
  Then the app starts in the paper environment
  And the "PAPER" badge is visible immediately
```

---

## Technical Notes

- **New page:** `SettingsPage` at route `#/settings` — includes the credential management and environment toggle. Navigation link added to the sidebar/nav.
- **Credential storage:** Use Electron's `safeStorage.encryptString()` / `decryptString()` for API secrets. Store encrypted blobs in a `settings` table or a separate `credentials.json` file. Never store plaintext secrets in SQLite.
- **New IPC channels:**
  - `settings:get-environment` — returns `"paper" | "live"`
  - `settings:set-environment` — accepts `{ environment: "paper" | "live" }`, reinitializes the provider
  - `settings:save-credentials` — accepts `{ environment, keyId, secret }`, encrypts and stores
  - `settings:test-connection` — accepts `{ environment, keyId, secret }`, returns `{ ok: true, accountInfo } | { ok: false, error }`
- **Provider reinitialization:** The `MarketDataFactory` needs a `switchEnvironment(env)` method that creates a new provider instance with the appropriate credentials and replaces the active one. In-flight requests should fail gracefully.
- **Environment indicator component:** `EnvironmentBadge` — placed in `PageLayout`'s header area, visible on every page. Uses the `useEnvironment()` hook (TanStack Query, `staleTime: Infinity`).
- **Query cache invalidation:** On environment switch, call `queryClient.invalidateQueries()` to force all market data hooks to refetch.
- **Preload:** Add settings-related methods to the contextBridge API.

---

## Out of Scope

- Multiple broker support (future — only Alpaca for now, but credentials per provider)
- Account balance display (could be a separate settings/account info story)
- Automatic environment detection
- Environment-specific position databases (same DB, live data differs)

---

## Dependencies

- US-31 (MarketDataProvider adapter — the provider being configured)

---

## Estimate

5 points

## Mockup

- `mockups/us-37-environment-toggle.mdx`
