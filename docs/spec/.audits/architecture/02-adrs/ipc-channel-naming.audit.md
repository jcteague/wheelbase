---
page: docs/spec/architecture/02-adrs/ipc-channel-naming.md
audited_at: 2026-06-27
findings: 0
---

# Audit: ipc-channel-naming.md

## Verified (5)

- ✓ All listed position channels registered (non-test) in `src/main/ipc/`: `positions:create`, `positions:get`, `positions:list`, `positions:close-csp`, `positions:expire-csp`, `positions:assign-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:expire-cc`, `positions:roll-csp` (grep of `positions:` registrations matches all ten).
- ✓ Market-data channels present: `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`, `market-data:stock-quote` (push), `market-data:stream-error` (push).
- ✓ Preload camelCase mirrors: `closeCoveredCallEarly`, `expireCc`, `rollCsp`, `setStockQuoteTickers` all in `src/preload/index.ts:25-30`.
- ✓ Log labels snake-cased with `_unhandled_error` suffix: `positions_close_cc_early_unhandled_error` (`src/main/ipc/positions.ts:100`), `positions_roll_csp_unhandled_error` (`:123`), `positions_expire_cc_unhandled_error` (`:114`).
- ✓ Pattern `{domain}:{verb}-{noun}` holds across the surface.

## Drift (0)

(none — the registry also contains `positions:record-call-away` and `positions:roll-cc`, both of which follow the documented pattern; the ADR's channel list is illustrative, not exhaustive, so these are not drift.)

## Unverifiable (0)

## Missing files (0)

- ✓ Feature pages `us-4-close-csp.md`, `us-9-expire-cc.md`, `us-32-live-position-prices.md` all exist.

One-line: Audited ipc-channel-naming.md: 5 verified, 0 drift, 0 unverifiable, 0 missing.
