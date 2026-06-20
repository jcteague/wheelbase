# US-47: Close AlpacaBrokerProvider acceptance-criteria gaps

**As a** wheel trader relying on Alpaca for broker-side state,
**I want** the Alpaca broker provider to satisfy the remaining US-40 contract details exactly,
**So that** broker account info, activity polling, and credential failures behave predictably in both the app and the settings flow.

---

## Context

US-40 landed the main `AlpacaBrokerProvider` path, but a few acceptance-criteria details were left soft or implemented in adjacent code instead of the provider contract itself. Those gaps matter because they affect how broker errors surface, how environment mismatches are diagnosed, and whether downstream consumers can trust the broker payload shape without special cases.

This story does not add new broker capabilities. It hardens the existing Alpaca provider and IPC error contract so Epic 06 can treat US-40 as complete rather than "mostly there."

---

## Acceptance Criteria

```gherkin
Background:
  Given AlpacaBrokerProvider already exists as the BrokerProvider implementation
  And Alpaca credentials are loaded from the stored active broker environment

Scenario: getAccountInfo normalizes money fields to 4 decimal places
  Given Alpaca returns buying_power "10000.00", portfolio_value "50000", and cash "5000.1"
  When getAccountInfo is called
  Then the provider returns buyingPower "10000.0000"
  And portfolioValue "50000.0000"
  And cash "5000.1000"
  And the environment field remains "paper" or "live"
  And accountNumberMasked remains first 2 chars + "…" + last 3 chars

Scenario Outline: Every broker method rejects missing credentials with the same typed auth error
  Given no Alpaca credentials are configured in safeStorage for the active broker environment
  When <method> is called
  Then the call fails with broker error code "auth_failed"
  And the message is "Alpaca credentials not configured"
  And the error includes deeplink "settings/credentials/alpaca"

  Examples:
    | method            |
    | getAccountInfo    |
    | getActivities     |
    | getMarketStatus   |

Scenario: Broker IPC preserves the deeplink for auth failures
  Given the provider throws auth_failed with deeplink "settings/credentials/alpaca"
  When the renderer calls the broker IPC channel
  Then the IPC error payload includes code "auth_failed"
  And it includes message "Alpaca credentials not configured"
  And it includes deeplink "settings/credentials/alpaca"

Scenario: Paper endpoint detects live-key environment mismatch
  Given the stored broker environment is "paper"
  And the credential key id belongs to a live Alpaca account
  When the provider authenticates against paper-api.alpaca.markets
  Then the failure is surfaced as broker error code "environment_mismatch"
  And the message is "Environment mismatch — these are LIVE keys, not paper keys"
  And the error shape is usable by the existing settings UI

Scenario: Non-mismatch broker auth failures remain plain auth_failed
  Given the stored broker environment is "paper" or "live"
  And the credentials are invalid for reasons other than paper-live mismatch
  When any provider method receives 401 or 403 from Alpaca
  Then the failure is surfaced as broker error code "auth_failed"
  And it does not use "environment_mismatch"

Scenario: Live environment still routes to the live Alpaca host
  Given credentials are stored with environment "live"
  When getAccountInfo is called
  Then the Alpaca SDK client is initialized with paper false
  And the returned environment field is "live"
```

---

## Technical Notes

- Primary file: `src/main/integrations/alpaca-broker.ts`
- Shared broker error types likely need a `deeplink?: string` field so `handleIpcCall` can preserve it through the `{ ok: false, errors: [...] }` envelope.
- Keep the exact mismatch message aligned with US-37: `"Environment mismatch — these are LIVE keys, not paper keys"`.
- Normalize account money fields with the same decimal-string discipline used elsewhere in the app; do not return raw Alpaca strings.
- Add tests at the provider layer and IPC layer so the contract is locked at both boundaries.

---

## Out of Scope

- New broker features beyond account info, activities, and market status
- Order placement, cancellation, or any other Phase 4 execution behavior
- New settings-page layouts or new broker-environment UX beyond consuming the typed error payload
- Assignment detection or activity-ingestion scheduling

---

## Dependencies

- US-40 — `AlpacaBrokerProvider` baseline implementation
- US-37 — existing settings UI that already consumes `environment_mismatch`

---

## Estimate

3 points
