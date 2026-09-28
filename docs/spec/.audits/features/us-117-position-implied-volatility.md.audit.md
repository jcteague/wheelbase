---
page: docs/spec/features/us-117-position-implied-volatility.md
audited_at: 2026-09-28
findings: 1
---

# Audit: docs/spec/features/us-117-position-implied-volatility.md

## Verified (16)

- ✓ `GREEK_NAMES`, `isFiniteNumber` (uses `Number.isFinite`), `isUnusable`, `isCompleteGreeks` exist in `src/main/integrations/alpaca-market-data-mappers.ts:110-125`
- ✓ `export function nonFiniteFigures(snap): string[]` at `alpaca-market-data-mappers.ts:129`; `mapOptionQuote` at `:143` with finite-only Greeks (`:158`) and IV (`:166`)
- ✓ Mapper header "No I/O — every function here is total and side-effect free" at `alpaca-market-data-mappers.ts:3`
- ✓ `getOptionSnapshot` warns `alpaca_option_snapshot_non_finite_figure` with `{ contract, fields }` at `src/main/integrations/alpaca-market-data.ts:174-176`; `getOptionChainSnapshot` (`:181`) has no such warn
- ✓ Warn asserted in adapter unit test `src/main/integrations/alpaca-market-data.test.ts:845`
- ✓ Preload mirror: `greeks?` without `iv`, sibling `impliedVolatility?: string` at `src/preload/index.d.ts:255-262`
- ✓ Renderer mirror: `greeks?: OptionGreeks`, `impliedVolatility?: string` at `src/renderer/src/api/market-data.ts:38-40`; `OptionGreeks` has only delta/gamma/theta/vega
- ✓ `parseFinite(value): number | null` at `src/renderer/src/lib/format.ts:34`
- ✓ `CockpitInput.impliedVolatility: number | null` (required, nullable) at `src/renderer/src/lib/verdict.ts:38`
- ✓ `parseAllOrNothing` at `PositionCockpit.tsx:218`, routing the four Greeks through `parseFinite` (`:220-223`)
- ✓ `buildCockpitInput` routes `currentMid` and `underlying` through `parseFinite` (`PositionCockpit.tsx:244-245`)
- ✓ ContextStrip guard `iv != null && Number.isFinite(iv)`, dash fallback `'—'` at `ContextStrip.tsx:41`; sub-label `'implied vol'` unless `ivRank` at `:42`
- ✓ `ivRank` prop exists (`ContextStrip.tsx:24`, `PositionCockpit.tsx:28`) and the only production caller `src/renderer/src/pages/PositionDetailContent.tsx:50` does not pass it
- ✓ `fmtMoney`/`pnlColor`/`pnlClass` still use bare `parseFloat` (`format.ts:5,41,45`); HOLDING_SHARES card still uses bare `parseFloat` (`PositionCockpit.tsx:177-178`)
- ✓ `e2e/position-cockpit.spec.ts` carries nine US-117 cases: five `it`s (`:669,684,702,719,734`) + a four-field Scenario Outline loop (`:756`)
- ✓ Linked pages `../domain/market-data.md` and `us-34-position-cockpit.md` exist

## Drift (1)

- ✗ Line 45-46 states in present tense "The bench's IV _rank_ is a 0–100 percentile per underlying scraped from Barchart." Barchart scraping is retired; US-121 computes IV rank from the app's own IV30 history (no Barchart integration remains under `src/main`, only test-file mentions in `src/main/schemas.test.ts`, `src/main/index.test.ts`). Suggested fix: reword to "computed from the app's own IV30 history (US-121)" or frame as history ("at the time was scraped from Barchart").

## Unverifiable (3)

- ? "`contracts: 161, withGreeks: 87` for one underlying" — a runtime observation, not mechanically verifiable.
- ? "No producer in `src/main` has ever populated [`greeks.iv`]" — historical claim about pre-fix code.
- ? AC table "covered"/"split" results — assumes tests pass; not executed by this audit.

## Missing files (0)
