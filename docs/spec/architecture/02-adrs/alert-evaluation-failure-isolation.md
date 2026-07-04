# ADR: Alert evaluation isolates per-item failures and degrades boundary I/O

<!-- generated:from us-53-54-55 -->

## Decision

Scheduled batch evaluation (`evaluateAlerts`) must guarantee that **no single failure aborts the whole run**. Concretely:

- **Per-item isolation.** Each position is evaluated inside its own `try/catch`; a throw is logged (`alert_evaluation_failed`) and the loop continues. This is the US-50 compute-then-persist invariant ([alert-compute-then-persist](./alert-compute-then-persist.md)).
- **Boundary I/O degrades, never rejects.** The market-data pre-fetch runs the stock-quote and option-snapshot feeds concurrently (`Promise.all`), each wrapped in `fetchOrDegrade`: on failure it logs a WARN (`alert_evaluation_stock_quotes_unavailable` / `alert_evaluation_option_snapshots_unavailable`) and returns an empty result instead of rejecting.
- **Symbol building is non-throwing.** `occSymbolForRow` catches any `buildOccSymbol` error, logs `alert_evaluation_occ_symbol_invalid`, and returns `null`; symbols are built once into an `occByPositionId` map.
- **Callers guard throwing pure helpers.** A rule that feeds a pure helper which throws on invalid input (e.g. `computeUnrealizedPnl`, which requires `entryPremium > 0` and positive-integer `contracts`) must validate first in its `missingData` guard (`PROFIT_TARGET` → `invalid_profit_target_input`), so a bad leg skips cleanly rather than throwing out of `evaluatePosition`.

The guiding invariant: **one bad leg, one bad position, or a whole-provider outage must never suppress healthy positions' alerts — especially the market-data-independent DTE rules** (`EXPIRATION_IMMINENT` / `MANAGEMENT_WINDOW`).

## Why

The async refactor that added the live-market-data rules (US-54/US-55) originally hoisted the market-data pre-fetch and OCC-symbol building **above** the per-position loop, outside the US-50 isolation boundary. A high-effort code review found three regressions from this: a provider outage rejected the entire run, one malformed leg aborted the whole batch, and a non-positive stored premium threw out of the rule engine — each silently dropping the high-urgency DTE alerts for every other position. The isolation invariant was real but written nowhere, so the refactor had no reason to preserve it. This ADR records it so future changes to `evaluateAlerts` (or any batch-evaluation service) keep it intact; the mirrored rule in `CLAUDE.md` makes it read-before-work.

## Alternatives considered

- **One try/catch around the whole run** — rejected; it contains the crash but still loses the entire run's alerts on any single failure, which is exactly the defect.
- **Let pure helpers stay strict and rely on the per-position catch** — insufficient alone; the per-position catch drops _all_ of that position's alerts (including DTE), so throwing helpers must be guarded by the rule, not merely caught downstream.
- **Fetch feeds sequentially** — rejected; concurrent `Promise.all` with independent degradation is both faster and more resilient (a failure in one feed doesn't block or discard the other).

## Source

- `plans/us-53-54-55/data-model.md` (§7 Post-review hardening)
- `plans/us-53-54-55/refactor-phase-results.md` (Post-Review Hardening)
- Feature page: `../../features/us-53-54-55-market-data-alert-rules.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
