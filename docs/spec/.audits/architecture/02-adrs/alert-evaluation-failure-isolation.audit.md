---
page: docs/spec/architecture/02-adrs/alert-evaluation-failure-isolation.md
audited_at: 2026-09-28
findings: 2
---

# Audit: docs/spec/architecture/02-adrs/alert-evaluation-failure-isolation.md

## Verified (7)

- ✓ Per-position `try/catch` logging `alert_evaluation_failed` and continuing — `src/main/services/evaluate-alerts.ts:240-265`.
- ✓ Market-data pre-fetch runs concurrently via `Promise.all`, each feed wrapped in `fetchOrDegrade` (WARN + fallback) — `evaluate-alerts.ts:170-182` (`fetchOrDegrade`), `:211-230` (`Promise.all`). Events `alert_evaluation_stock_quotes_unavailable` and `alert_evaluation_option_snapshots_unavailable` exist. Note: a third feed (earnings, `alert_evaluation_earnings_unavailable`) is degraded the same way; the page names only two, which is incomplete but not wrong.
- ✓ `occSymbolForRow` catches `buildOccSymbol` errors, logs `alert_evaluation_occ_symbol_invalid`, returns `null` — `evaluate-alerts.ts:77-96` (log at :94).
- ✓ Symbols built once into `occByPositionId` — `evaluate-alerts.ts:201-203`.
- ✓ `computeUnrealizedPnl` throws on `entryPremium <= 0` and non-positive-integer `contracts` — `src/main/core/costbasis.ts:285-295`.
- ✓ `PROFIT_TARGET` `missingData` guard returns `invalid_profit_target_input` when inputs are not computable — `src/main/core/alerts.ts:49,130-137,262`.
- ✓ Mirrored rule in `CLAUDE.md` (Architecture Rules, "Scheduled batch jobs ... must isolate per-item failures") links this ADR.

## Drift (0)

## Unverifiable (1)

- ? The history of the async refactor and the code review that found three regressions — narrative.

## Missing files (2)

- ✗ Source `plans/us-53-54-55/data-model.md` does not exist (no `plans/us-53-54-55/` directory).
- ✗ Source `plans/us-53-54-55/refactor-phase-results.md` does not exist.
