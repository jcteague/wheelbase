---
page: docs/spec/architecture/02-adrs/save-verified-alpaca-service.md
audited_at: 2026-06-27
findings: 0
---

# Audit: save-verified-alpaca-service.md

## Verified (6)

- ✓ Service file exists — `src/main/services/save-verified-alpaca-credentials.ts`.
- ✓ Exports `saveVerifiedAlpacaCredentials` — `save-verified-alpaca-credentials.ts:36`.
- ✓ Returns a `refreshBroker` flag — `save-verified-alpaca-credentials.ts:70` (`refreshBroker: shouldRefreshBroker(previous, status, input.environment)`).
- ✓ IPC handler calls the service rather than inlining the flow — `src/main/ipc/settings.ts:61` (`await settings.saveVerifiedAlpacaCredentials(parsed)`), declared in the service dep type at `:20`.
- ✓ `settings.ts` retains `saveAlpacaCredentials` for already-verified callers — `src/main/services/settings.ts:173,226`.
- ✓ Service composes `getCredentialStatus`, `saveAlpacaCredentials`, `testAlpacaConnection` (all present in `settings.ts` at `:157,173,154`); the ADR's "via injected dependencies" matches the dep-type pattern.

## Drift (0)

None.

## Unverifiable (2)

- ? Return shape `{ status, test, refreshBroker }` — `refreshBroker` confirmed; full destructuring of `status`/`test` not line-verified but consistent with the service.
- ? `refreshBroker` is computed "by comparing pre-save and post-save `CredentialStatus.activeBrokerEnv`" — `shouldRefreshBroker(previous, status, ...)` exists; the internal comparison logic is narrative-level.

## Missing files (0)

- `../../.extracts/us-37.md` cited as source — extract reference, not a code claim.
