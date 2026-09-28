---
page: docs/spec/architecture/02-adrs/ipc-channel-naming.md
audited_at: 2026-09-28
findings: 8
---

# Audit: docs/spec/architecture/02-adrs/ipc-channel-naming.md

## Verified (6)

- ✓ Position channels `positions:create`, `:get`, `:list`, `:close-csp`, `:expire-csp`, `:assign-csp`, `:open-cc`, `:close-cc-early`, `:expire-cc`, `:roll-csp` all registered — `src/main/ipc/positions.ts:54-131`.
- ✓ Market-data channels `market-data:stock-quotes`, `:set-stock-quote-tickers`, `:market-status`, and push events `:stock-quote`, `:stream-error` present in `src/main/ipc/market-data.ts` / `src/main/index.ts`.
- ✓ Preload methods `closeCoveredCallEarly`, `expireCc`, `rollCsp`, `setStockQuoteTickers` mirror their channels — `src/preload/index.ts:25-31`.
- ✓ Log labels `positions_close_cc_early_unhandled_error` and `positions_roll_csp_unhandled_error` — `src/main/ipc/positions.ts:108,131`.
- ✓ Later channels follow the pattern (`positions:roll-cc`, `positions:record-call-away`, `ivr:collect-now`, `screener:save-criteria`, `watchlist:snapshot`, …).
- ✓ All linked extracts and features exist.

## Drift (0)

None.

## Unverifiable (2)

- ? Log-label convention is not uniform: `market-data:set-stock-quote-tickers` uses `market_data_set_tickers_unhandled_error` (grep of `src/main/ipc/market-data.ts`). A code deviation from the stated convention rather than a false page claim; flag for review.
- ? Rationale bullets (greppability, abbreviation choice) — narrative.

## Missing files (0)

None.
