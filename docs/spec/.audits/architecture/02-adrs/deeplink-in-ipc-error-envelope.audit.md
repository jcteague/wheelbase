---
page: docs/spec/architecture/02-adrs/deeplink-in-ipc-error-envelope.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/deeplink-in-ipc-error-envelope.md

## Verified (6)

- ✓ `handleIpcCall` has a dedicated `BrokerError` branch, separate from `MarketDataError`, spreading `...(err.deeplink ? { deeplink: err.deeplink } : {})` — `src/main/ipc/utils.ts:34-43`.
- ✓ Envelope `errors: [{ field: '__root__', code: err.code, message }]` alongside `deeplink` — `src/main/ipc/utils.ts:38-42`.
- ✓ `{ ok: false }` type includes `deeplink?: string` — `IpcErrorEnvelope` at `src/main/ipc/utils.ts:11`.
- ✓ `BrokerError` carries an optional `deeplink` — `src/main/integrations/broker-provider.ts:11-16`.
- ✓ Example value `'settings/credentials/alpaca'` is used on auth failure — `src/main/integrations/alpaca-broker.ts:89`.
- ✓ `MarketDataError` has no deeplink and its branch omits one — `src/main/ipc/utils.ts:44-51`; no `deeplink` in `market-data-provider.ts`.

## Drift (0)

## Unverifiable (1)

- ? "Top-level placement keeps it symmetric with `code`" and the race rationale for rejecting a separate IPC event — design narrative (`code?` is on the envelope type at `utils.ts:11`).

## Missing files (0)

- (none) — `../../.extracts/us-47-49.md`, `../../features/us-47-49-broker-ac-hardening.md`, `./ipc-envelope-contract.md` exist.
