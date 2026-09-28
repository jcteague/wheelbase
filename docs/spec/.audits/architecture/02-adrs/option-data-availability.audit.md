---
page: docs/spec/architecture/02-adrs/option-data-availability.md
audited_at: 2026-09-28
findings: 5
---

# Audit: option-data-availability.md

## Verified (4)

- ✓ `OptionSnapshot.greeks?` optional `{ delta, gamma, theta, vega }` — `src/main/integrations/market-data-provider.ts:44-49`; 4-dp strings — `alpaca-market-data-mappers.ts:158-160` (`toFixed(4)`).
- ✓ `impliedVolatility?` is a separate optional top-level string — `market-data-provider.ts:50`.
- ✓ `openInterest` and `volume` typed `number | null` — `market-data-provider.ts:42-43`.
- ✓ No live option stream: options stay on the REST snapshot path (`alpaca-market-data.ts` comment "option feeds stay on the REST snapshot path", ~`:367`); `MarketDataFeed` option members exist only as types.

## Drift (4)

- ✗ Decision (line 7) and Why (line 18) say Greeks/IV come from the **Massive** REST options snapshot, in the present tense. Massive was retired by US-99; they come from Alpaca `/v1beta1/options/snapshots` (`src/main/integrations/alpaca-market-data-mappers.ts:207-218`, mapping at `:143-165`).
- ✗ Line 12: "`openInterest` and `volume` … are always `null` from the snapshot endpoint." `volume` is `snap.dailyBar?.v ?? null` (`alpaca-market-data-mappers.ts:152`), and chain quotes carry `openInterest` from `/v2/options/contracts` (see `open-interest-from-contracts-endpoint` ADR; `alpaca-market-data.ts:198-202`). Only single-contract `openInterest` is always null (`mappers.ts:151`).
- ✗ Lines 14, 20: stock snapshots are "an aggregate bar … no bid/ask, so `price`/`bid`/`ask` all carry the last-minute close." The Alpaca REST seed maps `price = latestTrade.p` and real `bid`/`ask` from `latestQuote` (`alpaca-market-data-mappers.ts:56-65`); only stream bar ticks collapse `price = bid = ask = c` (`mapBar`, `:413-424`).
- ✗ Line 18: "single JSON WebSocket carries aggregate-minute (`AM`) stock bars" — the live socket is Alpaca IEX with per-symbol `bars` (`alpaca-market-data.ts:56`). Suggested fix: rewrite the page for Alpaca (US-99) and move Massive text to a history section.

## Unverifiable (1)

- ? Alternatives (derive volume from bars, second OI provider) — design history; partly overtaken by the contracts-endpoint OI ADR.

## Missing files (1)

- ✗ Source `src/main/integrations/massive-market-data.ts` does not exist.
