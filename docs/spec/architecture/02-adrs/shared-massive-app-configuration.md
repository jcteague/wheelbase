# ADR: Shared Massive app configuration (superseded)

<!-- generated:from us-37,us-99 -->

> **Superseded by [alpaca-sole-market-data-vendor](./alpaca-sole-market-data-vendor.md) (US-99, 2026-09-06).** Massive is no longer a vendor. Market data is served by Alpaca's free data plan using the trader's saved Alpaca broker credentials, so there is no shared, app-provided market-data key, no `CredentialStatus.massive`, and no `{ vendor: 'massive' }` connection test. The text below records the decision as it stood from US-37 until US-99.

## Decision (historical)

Massive credentials are not user-managed settings. The app loads the Massive key from shared app configuration/env/packaging, the settings page only displays Massive status and offers a fixed reference probe, and no `credential_settings` row is created for Massive.

## Context / Why (historical)

- Product clarification after the original story draft established that Massive is shared across users, while Alpaca paper/live credentials remain user-specific.
- Mixing Massive into user settings would make the broker environment toggle look like it controls market-data auth, which the story explicitly avoids.
- The runtime lifecycle split depends on this separation: broker changes recreate only the broker provider, while market data stays tied to shared configuration.

## Alternatives considered (historical)

- **Per-user Massive settings rows** — rejected because it conflicts with the clarified deployment model and would require save/remove settings flows the shipped UI intentionally omits.
- **Hide Massive entirely from Settings** — rejected because the story still needs status visibility and a deterministic connection test.

## What replaced it (US-99)

- `CredentialStatus.marketData: 'configured' | 'missing'` replaces `massive` and `massiveLastCheckedAt`, derived as `activeBrokerEnv !== 'none' || hasFallbackCredentials()`.
- `settings:test-connection` accepts only `{ vendor: 'alpaca', environment, keyId, secret }`; `testMassiveConnection` and its `api.syncswimmer.com` probe (a host that never resolved) are gone.
- The Settings "Market Data — Alpaca" region explains that stock prices (IEX), option quotes (indicative) and Greeks come from Alpaca using the active broker credentials, and has no test button.
- The broker environment toggle **does** now affect market-data auth — by design, since they are the same keys — and restarts the stock stream (see [market-data-lazy-credentials-stream-restart](./market-data-lazy-credentials-stream-restart.md)).

## Sources

- [extract: us-37](../../.extracts/us-37.md), [extract: us-99](../../.extracts/us-99.md)
- [feature: us-37-paper-live-broker-environment-toggle](../../features/us-37-paper-live-broker-environment-toggle.md), [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
