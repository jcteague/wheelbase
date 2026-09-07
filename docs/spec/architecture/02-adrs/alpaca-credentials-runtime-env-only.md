# ADR: Dev-fallback Alpaca credentials come from `process.env` only — never `import.meta.env`

<!-- generated:from us-99 -->

## Decision

`loadAlpacaCredentialsFromEnv()` (`src/main/integrations/alpaca-credentials.ts`) is the shared default credential source for **both** `brokerFactory` and `marketDataFactory`. It reads `ALPACA_KEY_ID`, `ALPACA_SECRET_KEY` and `ALPACA_PAPER` from `process.env` and nothing else; an explicitly empty value reads as "not configured". `.env.example` states that there is deliberately **no** way to configure Alpaca credentials from `.env` — export the variables for the process instead (`ALPACA_KEY_ID=… ALPACA_SECRET_KEY=… ALPACA_PAPER=true pnpm dev`). Credentials saved in Settings (safeStorage) take priority over the fallback.

`CredentialStatus.marketData` reflects the same reality: `activeBrokerEnv !== 'none' || hasFallbackCredentials()`, where `hasFallbackCredentials` is a **required** `SettingsServiceOptions` seam wired by `src/main/index.ts` to `loadAlpacaCredentialsFromEnv() !== null`.

## Context / Why

- `electron-vite` resolves `MAIN_VITE_*` values at **build** time by substituting them into the bundle, so a key set in `.env` ends up in plaintext in `out/main/index.js` and in anything `electron-builder` packages from it. A computed `import.meta.env[name]` lookup is worse still — Vite cannot string-replace it, so it injects the whole env object and every `MAIN_VITE_*` value lands in the bundle whether or not any code reads it. `process.env` is read at runtime and never inlined.
- The empty-string-means-unconfigured rule lets the e2e harness (`buildLaunchEnv`, `withoutBrokerCredentials` in `e2e/assignment-helpers.ts`) construct a credential-less app regardless of what the developer's shell exports, so a spec's credential state is a property of the test, not of the machine.
- Before the loader was shared, market data read `.env` while the broker ignored it. The one visible symptom was working prices next to a permanently failing `broker_market_status`, with no error naming the cause. A required (not defaulted) `hasFallbackCredentials` exists for the same reason — a silent `() => false` is how the two factories drifted apart in the first place — and it keeps the settings service database-facing: `index.ts` owns the knowledge of where "outside the database" is.

## Alternatives considered

- **`process.env` with an `import.meta.env.MAIN_VITE_ALPACA_*` fallback** — implemented first, then removed in the final commit for the inlining hazard above. (The credential-source diagram in `docs/us-99-implementation.md` predates the removal.)
- **Default `hasFallbackCredentials` to `() => false`** — reports "missing" while env-fallback quotes flow, and re-opens the drift.

## Consequences

- `src/main/env.d.ts` still declares the pre-existing `MAIN_VITE_ALPACA_*` types, but no code reads them.
- Never build a distributable on a machine with real keys in `.env`; Settings (safeStorage) is the intended path.

## Sources

- [extract: us-99](../../.extracts/us-99.md) — ADR "Dev-fallback credentials come from `process.env` only — never `import.meta.env`"; ADR amendment on `CredentialStatus.marketData`
- [feature: us-99-alpaca-market-data-provider](../../features/us-99-alpaca-market-data-provider.md)
<!-- /generated -->
