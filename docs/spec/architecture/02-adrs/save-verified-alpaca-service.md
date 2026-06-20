# ADR: Save-verified Alpaca credentials as a dedicated service

<!-- generated:from us-37 -->

## Decision

The test-connection → validate → save → compute-refresh-flag flow lives in `src/main/services/save-verified-alpaca-credentials.ts`, not inline in the IPC handler. The IPC handler calls `saveVerifiedAlpacaCredentials` and receives back `{ status, test, refreshBroker }`.

## Context / Why

The original US-37 plan drafted `settings:save-alpaca-credentials` as a thin handler that would delegate to `settings.ts`. During code review, the handler was found to contain orchestration logic — trim, validate, test connection, save on success, decide whether to recreate the broker provider — that belongs in the service layer. Extracting it keeps the handler thin and makes the flow independently testable.

## Alternatives considered

- **Inline in `src/main/ipc/settings.ts`** — initial implementation; rejected during code review because IPC handlers must be thin (Zod parse + single service call). Multi-step orchestration in a handler obscures branching logic and makes it harder to unit-test without setting up full IPC.
- **Inside `settings.ts`** — considered as an extension of the credential-persistence service; rejected because it would mix the persistence concern (`saveAlpacaCredentials`) with the test-then-save orchestration. Keeping them separate lets callers call the raw save without the connection-test step.

## Consequences

- `settings.ts` retains `saveAlpacaCredentials` for callers that have already verified credentials.
- `save-verified-alpaca-credentials.ts` composes `getCredentialStatus`, `saveAlpacaCredentials`, and `testAlpacaConnection` via injected dependencies, making it straightforward to test without hitting SQLite or Alpaca.
- The `refreshBroker` flag is computed by comparing the pre-save and post-save `CredentialStatus.activeBrokerEnv` against the changed environment, so the broker provider is only recreated when necessary.

## Sources

- [extract: us-37](../../.extracts/us-37.md) — post-plan extraction during code-review phase
- `src/main/services/save-verified-alpaca-credentials.ts`
- `src/main/ipc/settings.ts`

<!-- /generated -->
