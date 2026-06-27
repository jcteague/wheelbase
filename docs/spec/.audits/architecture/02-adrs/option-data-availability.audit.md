---
page: docs/spec/architecture/02-adrs/option-data-availability.md
audited_at: 2026-06-27
findings: 0
---

# Audit: option-data-availability.md

## Verified (3)

- ✓ `OptionSnapshot.greeks` is an optional field on the type — `src/main/integrations/market-data-provider.ts:43` (`greeks?: {...}`).
- ✓ `openInterest` and `volume` are typed `number | null` on `OptionSnapshot` — `src/main/integrations/market-data-provider.ts:41-42`.
- ✓ Stream feed/event types carry `StockQuote | OptionSnapshot` and the stream path is an RxJS subject, separate from the REST snapshot path that populates greeks/iv — `market-data-provider.ts:66-83`, `massive-market-data.ts:256-263`.

## Drift (0)

(none mechanically detectable)

## Unverifiable (3)

- ? "greeks/iv populated only by the REST snapshot endpoint; stream events never carry them" — the shipped provider is Massive (not Alpaca); the type allows `greeks?` optional but whether stream events ever set it is a behavioural claim not falsified by a single grep. Plausible and consistent with the RxJS tick subject only forwarding bar ticks.
- ? "openInterest/volume always null for Alpaca — absent from every Alpaca option endpoint" — Alpaca-specific rationale; provider is now Massive, so the Alpaca framing is narrative/historical.
- ? `OptionSnapshot.iv` field presence — not directly confirmed in the lines read (greeks confirmed at line 43); flag for human review.
