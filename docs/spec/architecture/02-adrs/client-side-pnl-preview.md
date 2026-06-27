# ADR: Client-side P&L / net-credit previews — no IPC round-trip

<!-- generated:from us-4, us-7, us-8, us-12 -->

## Decision

All in-form numeric previews (P&L on close, net credit/debit on roll, cost-basis guardrail on CC open) are computed locally in the renderer using `decimal.js`. There is no debounced IPC call; the math runs on every keystroke via `useWatch` (or the equivalent reactive form state). The same pure math lives inside the lifecycle / cost-basis engines for the authoritative post-submit calculation, but it is duplicated in the renderer for preview purposes.

The previews live in UI components (`CcPnlPreview` under `components/ui/`, `NetCreditDebitPreview` as an inline component within each roll form) or extracted pure helpers (`computeGuardrail` in `openCcGuardrail.ts`, `computeNetCreditDebit` in `lib/rolls.ts`). The close-CSP preview (`computePreview`) is a local function inside `CloseCspForm.tsx` rather than an extracted helper.

## Context / Why

- All required inputs (open premium, contracts, current basis, current expiration) are already loaded on the detail page; nothing comes from the server during input.
- IPC round-trips would introduce latency and require debounce logic that adds no value for arithmetic that takes microseconds.
- Pure decimal math gives instant feedback and matches the authoritative server-side calculation byte-for-byte (same `decimal.js` library, same `ROUND_HALF_UP`).
- Acceptance criteria require live updates as the trader types (`Net Credit: $1.60/contract ($160.00 total)` updates per keystroke).

## Alternatives considered

- **Debounced IPC preview endpoint** — rejected; latency + infrastructure for math that's already trivial.
- **Native `number` math in the renderer** — rejected; would drift from the server's `decimal.js` result and produce visible rounding mismatches between the form preview and the post-submit success card.
- **Compute previews server-side via the lifecycle engine** — rejected; same authoritative math is reachable in the renderer by re-using a shared helper.

## Consequences

- The renderer imports `decimal.js` directly and applies `ROUND_HALF_UP` for parity with the server.
- Pure helper functions are extracted where it aids reuse and satisfies the `react-refresh/only-export-components` lint rule: `computeNetCreditDebit` lives in `src/renderer/src/lib/rolls.ts` and `computeGuardrail` in `src/renderer/src/components/openCcGuardrail.ts`. `computePreview` remains a local function inside `CloseCspForm.tsx` (not extracted to `lib/`).
- Renderer-side helpers are unit-tested with the same numeric fixtures the server tests use, ensuring formula parity.
- US-8 caught a bug here: the `CcPnlPreview` percentage formula was `closePrice / openPremium × 100` ("% of premium paid back") rather than `(openPremium − closePrice) / openPremium × 100` ("% of max captured"). Fixed in `us-8-pct-fix` — see ADR [pct-of-max-formula](./pct-of-max-formula.md).

## Sources

- [extract: us-4](../../.extracts/us-4.md) — ADR "P&L preview — frontend-only calculation"
- [extract: us-7](../../.extracts/us-7.md) — ADR "Cost basis guardrail is client-side only and non-blocking"
- [extract: us-8](../../.extracts/us-8.md) — ADR "P&L preview display logic (renderer)"
- [extract: us-12](../../.extracts/us-12.md) — ADR "Net credit/debit preview computed client-side"
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-7-open-covered-call](../../features/us-7-open-covered-call.md)
- [feature: us-8-close-cc-early](../../features/us-8-close-cc-early.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
