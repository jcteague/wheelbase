# ADR: Runtime broker provider refresh

<!-- generated:from us-37,us-99 -->

## Decision

Broker settings changes refresh broker state at runtime without restarting the app. `src/main/index.ts` wires broker IPC handlers against a current-provider accessor, `broker-factory.ts` reloads the active Alpaca environment from persisted settings, and settings mutations call the `onBrokerProviderChanged` hook only when broker state actually changed.

**Amended by US-99.** The same Alpaca credentials now also serve market data, so `onBrokerProviderChanged` additionally calls `restartStockQuoteStream()` (returned by `registerMarketDataHandlers`) after `brokerFactory.recreate()`. The market-data provider instance is **not** recreated — it resolves credentials lazily on every REST call — but the websocket authenticates once at connect, so the stock stream is torn down and re-established with the remembered tickers. See [market-data-lazy-credentials-stream-restart](./market-data-lazy-credentials-stream-restart.md).

## Context / Why

- The original startup-only provider wiring could not honor a paper/live switch without restarting the app.
- US-37 requires immediate updates to broker account, cash, buying power, and activity surfaces after saving or switching Alpaca credentials.
- US-37 also required market-data requests to continue uninterrupted while broker state changed — true while market data had its own vendor and key. US-99 replaced that vendor with Alpaca; "uninterrupted" now means REST reads keep working with no lifecycle event, while the stream reconnects with the new keys (a connect failure logs a warning and leaves REST working).

## Alternatives considered

- **Restart the app after credential changes** — rejected because the acceptance criteria call for immediate updates.
- **Recreate both broker and market-data providers together** — rejected in US-37 as coupling unrelated vendor state; rejected again in US-99 because recreating the market-data provider would orphan `StreamState.connected` and the renderer's push subscription.
- **Introduce a heavy service container** — rejected in favor of smaller factories and handler-level accessors.

## Consequences

- `settings:set-active-broker-environment` always triggers a broker refresh after validation succeeds.
- Saving or removing credentials refreshes the broker provider only when the changed environment was or became active.
- Broker-unconfigured state is represented explicitly as `activeBrokerEnv: 'none'`; with no env fallback this also makes `CredentialStatus.marketData` `'missing'`.
- Both factories default to the shared `loadAlpacaCredentialsFromEnv()` (`process.env` only) and are configured from `settings.loadActiveAlpacaCredentials()` in `index.ts`; `marketDataFactory` never throws when unconfigured.
- E2E: `Switching broker environment restarts market data with the new keys` (`e2e/settings-environment.spec.ts`) proves the restart path does not drop stream state; the `LiveBrokerConfirmDialog` copy now says market data reconnects with the live keys.

## Sources

- [extract: us-37](../../.extracts/us-37.md), [extract: us-99](../../.extracts/us-99.md)
- [feature: us-37-paper-live-broker-environment-toggle](../../features/us-37-paper-live-broker-environment-toggle.md), [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
