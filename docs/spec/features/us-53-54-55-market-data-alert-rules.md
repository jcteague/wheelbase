# US-53/54/55: Market-Data Alert Rules (Management Window, Profit Target, Strike Proximity)

<!-- generated:from us-53-54-55 -->

## Summary

Three Classic Wheel management rules run inside the Epic 07 alert engine on the existing scheduler cadence, surfacing deduplicated, restart-safe alerts in the US-51 management queue alongside the DTE rules:

- **MANAGEMENT_WINDOW** (US-53, medium) — a position sits in the 6–21 DTE roll/close window.
- **PROFIT_TARGET** (US-54, low) — an open short option leg has captured at least its profit target of max profit.
- **STRIKE_PROXIMITY** (US-55, medium) — a CSP's underlying is within 1% of the put strike (assignment risk).

Because PROFIT_TARGET and STRIKE_PROXIMITY need live marks, `evaluateAlerts` is now async: it pre-fetches option mids and underlying prices at the service boundary and passes plain values into the pure `RULES` registry, which stays I/O-free. A subsequent high-effort review added a failure-isolation hardening pass so no single bad leg, bad position, or provider outage can suppress healthy positions' alerts. No new tables or migrations.

See the [Management Alerts](../domain/alerts.md) domain page and the [Market Data](../domain/market-data.md) domain page for the surrounding context.

## Acceptance criteria

Each AC maps to one named e2e scenario in `src/main/services/evaluate-alerts.e2e.test.ts`.

**US-53 — MANAGEMENT_WINDOW**

- Alert fires when a position enters the 21-DTE window (MSFT `CC_OPEN` @ 21 DTE → medium, `"21 DTE remaining — review for roll or close"`).
- Alert stays open between 6 and 21 DTE; re-eval @ 12 DTE keeps it open, updates summary, same `triggered_at`.
- Alert does not fire outside the threshold (22 DTE → none).
- Expiration-imminent takes precedence inside 5 DTE (4 DTE → only `EXPIRATION_IMMINENT`).

**US-54 — PROFIT_TARGET**

- Alert fires when unrealized profit reaches the default target (AAPL `CSP_OPEN`, entry 3.50, mid 1.70, target 50% → low, `"51.4% of max profit captured — consider closing"`).
- Alert fires for an open covered call at target (MSFT `CC_OPEN`, entry 4.00, mid 1.90 → low, `"52.5% of max profit captured — consider closing"`).
- Alert does not fire before the target (entry 3.50, mid 2.40 → none).
- Position without a live option mark is skipped (no mid → no row + DEBUG skip log).
- Holding-shares positions never receive it (TSLA `HOLDING_SHARES` → none; dropped by the active-leg inner join).

**US-55 — STRIKE_PROXIMITY**

- Fires within 1% above the CSP strike (AAPL `CSP_OPEN` $180, price 181.20 → medium, `"Stock is 0.7% above the $180.00 put strike"`).
- Fires within 1% below the CSP strike (price 179.10 → medium, `"Stock is 0.5% below the $180.00 put strike — now in the money"`).
- Does not fire when safely away (price 183.80 → none).
- Covered-call positions do not use this rule (MSFT `CC_OPEN` $420, price 419.60 → none).

## What was built

Three new/verified pure predicates live in the `RULES` registry in `src/main/core/alerts.ts`. **MANAGEMENT_WINDOW** was already implemented at the engine level (this plan added AC-driven verification); it matches when `dte > EXPIRATION_IMMINENT_MAX_DTE (5) && dte <= managementWindowDte (default 21)` and remains mutually exclusive with `EXPIRATION_IMMINENT` via their DTE windows. **PROFIT_TARGET** matches when `capturedPct >= resolveProfitTarget(override)`, where `capturedPct` comes from `computeUnrealizedPnl`; it applies to any open short option leg (CSP or CC). **STRIKE_PROXIMITY** is CSP-only: with `proximityPct = |price − strike| / strike × 100`, it matches when `phase === 'CSP_OPEN' && proximityPct <= 1`, and its summary states direction (`price >= strike` → "above", else "below … now in the money").

The market-data dependency is resolved once per run at the **service boundary** (`src/main/services/evaluate-alerts.ts`), not inside rules. The compute phase builds OCC symbols once per row into an `occByPositionId` map, then issues one batched `fetchStockQuotes` for the distinct evaluable tickers and one batched `fetchOptionSnapshots` for the distinct evaluable OCC symbols. Results become a `ticker → price` map and an `occSymbol → mid` map that feed `AlertEvaluationInput` as plain strings. The pure engine reads only the input record. The compute/persist split from US-50 is retained — all awaits happen before the unchanged `db.transaction` persist phase, so atomicity holds.

Missing data is handled by a **generalized skip mechanism**: `RuleDefinition.requiresDte` (a boolean) was replaced with an optional `missingData?: (input) => string | null` returning a per-rule skip reason. DTE rules return `missing_dte`; PROFIT_TARGET returns `missing_option_mark` (or `invalid_profit_target_input`); STRIKE_PROXIMITY returns `missing_underlying_price` for a CSP with no price. `evaluatePosition` records a `SkippedRule` when the reason is non-null, otherwise runs `test`.

The **post-review hardening pass** enforces a single invariant: one bad leg, one bad position, or a provider outage must never prevent healthy positions' alerts — especially DTE rules — from being evaluated and persisted. Three defects were fixed TDD-first: (1) both feeds now run concurrently under `Promise.all`, each wrapped in a `fetchOrDegrade` helper that logs WARN and degrades to empty on failure; (2) `occSymbolForRow` catches OCC-build throws, logs, and returns `null`; (3) a `hasComputableProfit` guard makes PROFIT_TARGET skip cleanly on non-positive premium or non-positive-integer contracts instead of throwing.

## Architecture decisions

- **Pre-fetch live marks in the service; keep the rule engine pure.** Mids and underlying prices are batched in the service and passed as plain strings; `RULES` predicates never call a provider. Preserves the pure-core rule and the [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md) pattern, keeps one provider round-trip per data type per run, and keeps predicates unit-testable with literal inputs. Rejected: fetching inside each predicate (violates pure-core, N calls) and a synchronous price-cache table (adds an unneeded staleness/write path).
- **`evaluateAlerts` becomes async.** The provider API is async-only, so the service returns `Promise<EvaluateAlertsResult>` and accepts an injected `provider`. Rejected: keeping it sync and fetching in the handler (pushes orchestration into the thin handler and splits the compute phase across files).
- **Generalize the missing-data skip from `requiresDte` to a per-rule reason function.** A single `missingData` function supplies the skip-reason string directly (needed for US-54's DEBUG skip log) and keeps each rule self-contained per the [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md). Rejected: adding more booleans (`requiresOptionMark`, etc.) — more bookkeeping, no reason string.
- **STRIKE_PROXIMITY is CSP-only and states direction; below-strike flags in-the-money.** Matches US-55 ACs exactly — CC positions are excluded (covered-call breach is US-62; PMCC is Epic 09), and below-strike is the genuine assignment-risk case. The denominator is the strike (not current price) because the summary is phrased relative to the strike and the AC values round identically. See [Management Alerts](../domain/alerts.md).
- **New rules co-fire with DTE rules (no cross-rule precedence).** PROFIT_TARGET / STRIKE_PROXIMITY are orthogonal to the DTE rules; a position can hold an open PROFIT_TARGET and an open EXPIRATION_IMMINENT simultaneously (distinct `rule_code`s, distinct rows under the partial unique index). Only EXPIRATION_IMMINENT ↔ MANAGEMENT_WINDOW stay mutually exclusive. Rejected: suppressing lower-urgency rules — no AC asks for it and it would hide actionable signals.
- **Failure-isolation invariant (post-review hardening).** No single failure may abort the run and suppress unrelated (market-data-independent) DTE alerts. Enforced by `fetchOrDegrade` + `Promise.all`, guarded `occSymbolForRow`, and the `hasComputableProfit` guard. Log events: WARN `alert_evaluation_stock_quotes_unavailable` / `alert_evaluation_option_snapshots_unavailable` on feed outage; `alert_evaluation_occ_symbol_invalid` on a bad OCC symbol; DEBUG `alert_rule_skipped` on any skip; error `alert_evaluation_failed` on a per-position throw (persist still runs for the rest, unchanged US-50 behavior).
- **Deliberately not changed.** `profit_target_percent = 0` is honored as a real 0% override (fires at breakeven) — `resolveProfitTarget(0) === 0` is locked by an explicit test; left as-is pending a product decision on whether `0` should mean "unset → 50% default". `capturedPercent` / `proximityPercent` are recomputed in both `test` and `summary` — inherent to the registry's uniform `summary: (input) => string`; the Decimal work is cheap and only runs for matched rules, so the pattern was kept over threading a precomputed value.

Skip-reason strings (stable, auditable): `missing_dte`, `missing_option_mark`, `missing_underlying_price`, `invalid_profit_target_input`.

## Contracts touched

**`evaluateAlerts` (internal service contract — now async).** Scheduler-invoked; not an IPC handler, so no `{ ok, errors }` envelope. `EvaluateAlertsResult` (`{ createdCount, updatedCount, resolvedCount, skippedRuleCount }`) is unchanged.

```typescript
// src/main/services/evaluate-alerts.ts
export async function evaluateAlerts(input: {
  db: Database.Database
  provider?: MarketDataProvider // NEW — defaults to market-data-factory getProvider()
  now?: Date
  managementWindowDte?: number // default DEFAULT_MANAGEMENT_WINDOW_DTE (21)
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>
}): Promise<EvaluateAlertsResult> // was synchronous EvaluateAlertsResult
```

**Provider methods consumed (existing external contract).** Reached through service wrappers, never the provider directly:

- `fetchStockQuotes(provider, tickers)` → `Record<ticker, IpcStockQuote>` (`.price` TEXT), backed by `getStockQuotes`.
- `fetchOptionSnapshots(provider, symbols)` → `{ snapshots, unavailable }` (`OptionSnapshot.mid` TEXT), backed by `getOptionSnapshot`.

**No new IPC handler.** Open alerts are already read by the US-51 management-queue handler; rule codes are opaque to it, so new rule codes need no handler change.

## Source files

- `src/main/core/alerts.ts` — extended `RuleCode`; added `AlertEvaluationInput` fields; replaced `requiresDte` with `missingData?`; added the three skip-reason constants; added PROFIT_TARGET and STRIKE_PROXIMITY rules plus `capturedPercent` / `proximityPercent` helpers and the `hasComputableProfit` guard; generalized `evaluatePosition` skip collection.
- `src/main/services/evaluate-alerts.ts` — async `evaluateAlerts` with injected provider; extended query/row types; batched concurrent pre-fetch with `fetchOrDegrade`; guarded `occSymbolForRow` + `occByPositionId`; extended `toEvaluationInput`.
- `src/main/index.ts` — `alert-evaluation` handler resolves the shared provider and awaits `evaluateAlerts({ db, provider })`.
- `src/main/services/evaluate-alerts.e2e.test.ts` — 13 AC-driven scenarios.
- `src/main/services/evaluate-alerts-test-utils.ts` — shared test-utils module (`seedAaplCsp` fixture; named to dodge the `*.test.ts` glob).

Reused, not introduced: `src/main/core/costbasis.ts` (`computeUnrealizedPnl`), `src/main/core/profit-target.ts` (`resolveProfitTarget`, `DEFAULT_PROFIT_TARGET_PERCENT`), `src/shared/option-symbol.ts` (`buildOccSymbol`), `src/main/services/market-data.ts`, `src/main/integrations/market-data-factory.ts`, `src/main/integrations/market-data-provider.ts`, `src/main/services/alerts.ts`.

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
