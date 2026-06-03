# ADR: `decimal.js` with `ROUND_HALF_UP` at 4 dp, stored as TEXT

<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-12, us-32 -->

## Decision

All money arithmetic in the main process uses `decimal.js` with `Decimal.ROUND_HALF_UP` rounded to 4 decimal places. Money fields are stored as `TEXT` in SQLite and serialised as strings across the IPC boundary. The shared `round4` helper is the single source of truth for the rounding step. Renderer-side math (P&L previews, guardrail diffs) also uses `decimal.js` to avoid `parseFloat` drift.

The market-data adapter uses a separate 2 dp / 4 dp convention: prices and bid/ask are 2 dp strings (`"182.45"`), `changePercent` is 4 dp.

## Context / Why

- The wheel domain is built on cumulative premiums, strikes, and per-share basis numbers. Floating-point rounding (e.g. `0.1 + 0.2 = 0.30000000000000004`) would slowly corrupt the basis and break exact assertions in tests.
- TEXT storage avoids SQLite's REAL affinity round-trip and keeps the precise string the engine produced.
- `ROUND_HALF_UP` is the convention used by most trading platforms for end-of-day reporting; it also matches the integer-cent expectations of acceptance criteria (`+$120.00`, `-$1.70`, `+1.45`).
- 4 dp is enough to represent per-share figures plus an extra two decimals of precision for intermediate computations.

## Alternatives considered

- **Native `number` math** — rejected; floating-point error compounds across rolls and CC cycles.
- **Integer cents** — rejected; option premiums are quoted in fractional cents (`$2.35`) and intermediate cost-basis math needs more than 2 dp.
- **`bigint` arithmetic** — possible but requires manual scaling everywhere; `decimal.js` is the established library.

## Consequences

- Every cost-basis or P&L function returns 4 dp TEXT strings.
- Tests assert on exact string outputs (`'176.5000'`, `'120.0000'`) — no tolerance windows.
- Renderer adapters never re-parse money values with `parseFloat` for math; they keep strings and pass them to `decimal.js` for arithmetic before formatting for display.
- A handful of red-phase audits caught the mistake of mixing `.toString()` and `.toFixed(4)` (e.g. `calculateInitialCspBasis` returning `'146.5'` instead of `'146.5000'` — preserved intentionally because downstream consumers assert against 4 dp explicitly).
- Market-data quotes use 2 dp because that's the granularity Alpaca returns; the renderer formats them with the shared `fmtMoney` helper.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — "Decimal rounding uses 4 dp with `ROUND_HALF_UP` via the existing `round4` helper"
- [extract: us-5](../../.extracts/us-5.md) — `calculateCspExpiration` uses `decimal.js` `ROUND_HALF_UP`
- [extract: us-6](../../.extracts/us-6.md) — "All arithmetic in `calculateAssignmentBasis` uses `decimal.js` with `ROUND_HALF_UP` at 4 dp"
- [extract: us-7](../../.extracts/us-7.md) — `calculateCcOpenBasis` formula via `round4`
- [extract: us-8](../../.extracts/us-8.md) — `calculateCcClose` 4 dp, `ROUND_HALF_UP`
- [extract: us-12](../../.extracts/us-12.md) — `calculateRollBasis` formula
- [extract: us-32](../../.extracts/us-32.md) — REST adapter price/bid/ask 2 dp; `changePercent` 4 dp
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
