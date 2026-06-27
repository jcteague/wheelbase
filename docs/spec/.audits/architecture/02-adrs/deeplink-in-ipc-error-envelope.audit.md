---
page: docs/spec/architecture/02-adrs/deeplink-in-ipc-error-envelope.md
audited_at: 2026-06-27
findings: 0
---

# Audit: deeplink-in-ipc-error-envelope.md

## Verified (5)

- ✓ `handleIpcCall` has a dedicated `BrokerError` branch split from `MarketDataError`: `src/main/ipc/utils.ts:29` (BrokerError) and `:39` (MarketDataError).
- ✓ The branch spreads deeplink as a top-level field: `...(err.deeplink ? { deeplink: err.deeplink } : {})` at `src/main/ipc/utils.ts:35`, alongside the `errors[]` entry with `field: '__root__'`.
- ✓ The `{ ok: false }` return-type union includes `deeplink?: string`: `src/main/ipc/utils.ts:14`.
- ✓ `BrokerError` carries an optional `deeplink`: `src/main/integrations/broker-provider.ts:11,13,16`.
- ✓ `MarketDataError` branch does NOT add deeplink — its return at `src/main/ipc/utils.ts:46` has no deeplink spread, matching the "only BrokerError carries a deeplink" claim.

## Drift (0)

None.

## Unverifiable (1)

- ? "code (already top-level on some envelopes)" symmetry rationale — `code` is indeed top-level (`utils.ts:14,25`), but the broader design-justification framing is narrative.

## Missing files (0)

- ✓ Feature page `../../features/us-47-49-broker-ac-hardening.md` and ADR `ipc-envelope-contract.md` exist.
