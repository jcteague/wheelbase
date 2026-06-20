# ADR: Shared Massive app configuration
<!-- generated:from us-37 -->

## Decision

Massive credentials are not user-managed settings. The app loads the Massive key from shared app configuration/env/packaging, the settings page only displays Massive status and offers a fixed reference probe, and no `credential_settings` row is created for Massive.

## Context / Why

- Product clarification after the original story draft established that Massive is shared across users, while Alpaca paper/live credentials remain user-specific.
- Mixing Massive into user settings would make the broker environment toggle look like it controls market-data auth, which the story explicitly avoids.
- The runtime lifecycle split depends on this separation: broker changes recreate only the broker provider, while market data stays tied to shared configuration.

## Alternatives considered

- **Per-user Massive settings rows** — rejected because it conflicts with the clarified deployment model and would require save/remove settings flows the shipped UI intentionally omits.
- **Hide Massive entirely from Settings** — rejected because the story still needs status visibility and a deterministic connection test.

## Consequences

- `CredentialStatus.massive` reports only `configured` or `missing` based on shared app configuration.
- `CredentialStatus.massiveLastCheckedAt` exists in the contract but is currently always `null`; the implementation does not persist probe timestamps yet.
- The only Massive settings IPC flow is `settings:test-connection` with `{ vendor: 'massive' }`.
- Massive auth failures drive quote-surface degraded states and `StaleDataBanner`, but they do not change `EnvironmentBadge`.

## Sources

- [extract: us-37](../../.extracts/us-37.md)
- [feature: us-37-paper-live-broker-environment-toggle](../../features/us-37-paper-live-broker-environment-toggle.md)
<!-- /generated -->
