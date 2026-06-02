# ADR: Profit target — nullable column + hard-coded default constant

<!-- generated:from us-33 -->

## Decision

`positions.profit_target_percent INTEGER` is added as a nullable column via migration `005_add_profit_target_percent.sql`. The "global default" is a hard-coded `DEFAULT_PROFIT_TARGET_PERCENT = 50` in `src/main/core/profit-target.ts`. A pure helper `resolveProfitTarget(override: number | null): number` returns the override when non-null (explicit `=== null` check so `0` is a real override, not falsy-coalesced) and the constant otherwise. No `app_settings` table is introduced.

## Why

US-33 has no AC for setting the override — only for reading the effect of having one. A constant satisfies every AC and the per-position override satisfies the "AAPL has a per-position profit target of 25%" scenario. Centralising in `resolveProfitTarget` means a future settings UI replaces the constant in exactly one place; the column is already in the schema.

## Alternatives considered

- **`app_settings` key/value table** — adds storage and IPC surface for a feature without a story.
- **Env var** — no end-user control without a settings UI.

## Source

- `plans/us-33/research.md`
- `plans/us-33/data-model.md`
- Feature page: `../../features/us-33-option-mid-pnl.md`
<!-- /generated -->
