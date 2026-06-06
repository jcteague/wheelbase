# ADR: Runtime broker provider refresh
<!-- generated:from us-37 -->

## Decision

Broker settings changes refresh broker state at runtime without recreating market-data state. `src/main/index.ts` wires broker IPC handlers against a current-provider accessor, `broker-factory.ts` reloads the active Alpaca environment from persisted settings, and settings mutations call the broker refresh hook only when broker state actually changed.

## Context / Why

- The original startup-only provider wiring could not honor a paper/live switch without restarting the app.
- US-37 requires immediate updates to broker account, cash, buying power, and activity surfaces after saving or switching Alpaca credentials.
- The same story requires market-data requests to continue uninterrupted while broker state changes.

## Alternatives considered

- **Restart the app after credential changes** — rejected because the acceptance criteria call for immediate updates and uninterrupted market data.
- **Recreate both broker and market-data providers together** — rejected because it would couple unrelated vendor state and produce needless stock/option quote churn.
- **Introduce a heavy service container** — rejected in favor of smaller factories and handler-level accessors.

## Consequences

- `settings:set-active-broker-environment` always triggers a broker refresh after validation succeeds.
- Saving or removing credentials refreshes the broker provider only when the changed environment was or became active.
- Broker-unconfigured state is represented explicitly as `activeBrokerEnv: 'none'`.
- Market-data factories continue to load the shared Massive key from app configuration and are unaffected by broker settings mutations.

## Sources

- [extract: us-37](../../.extracts/us-37.md)
- [feature: us-37-paper-live-broker-environment-toggle](../../features/us-37-paper-live-broker-environment-toggle.md)
<!-- /generated -->
