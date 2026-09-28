---
page: docs/spec/architecture/02-adrs/save-verified-alpaca-service.md
audited_at: 2026-09-28
findings: 1
---

# Audit: save-verified-alpaca-service.md

## Verified (7)

- ✓ Service file `src/main/services/save-verified-alpaca-credentials.ts` exists and exports `saveVerifiedAlpacaCredentials` — line 36.
- ✓ Flow is trim/validate → test connection → save on success → compute refresh flag — `save-verified-alpaca-credentials.ts:44-71`.
- ✓ Returns `{ status, test, refreshBroker }` — `save-verified-alpaca-credentials.ts:67-71`.
- ✓ IPC handler `settings:save-alpaca-credentials` calls `settings.saveVerifiedAlpacaCredentials(parsed)` inside `handleIpcCall` — `src/main/ipc/settings.ts:61-73`.
- ✓ `settings.ts` retains `saveAlpacaCredentials` — `src/main/services/settings.ts:177`, exported at line 289.
- ✓ Dependencies `getCredentialStatus`, `saveAlpacaCredentials`, `testAlpacaConnection` are injected — `save-verified-alpaca-credentials.ts:10-14,37-41`; wired in `settings.ts:224-230`.
- ✓ `refreshBroker` compares pre-/post-save `activeBrokerEnv` against the changed environment — `shouldRefreshBroker`, `save-verified-alpaca-credentials.ts:26-34`.

## Drift (0)

None.

## Unverifiable (1)

- ? Code-review history (handler originally contained orchestration) — narrative.

## Missing files (0)

None. Extract link `../../.extracts/us-37.md` exists; both cited source files exist.
