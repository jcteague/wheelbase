# US-62: Covered-Call Breach Alert

<!-- generated:from us-62 -->

## Summary

Adds the `COVERED_CALL_BREACH` rule to the pure alert registry (see [alerts](../domain/alerts.md)): a medium-urgency alert fires when a `CC_OPEN` position's underlying trades **at or above** its short-call strike (the call is in the money), reporting the percent distance above the strike so the trader can gauge how deep ITM the covered call has gone and decide whether to roll up-and-out or accept the shares being called away. It is the covered-call counterpart to [US-55's CSP strike-proximity rule](us-53-54-55-market-data-alert-rules.md) and reuses the `strike` / `currentUnderlyingPrice` fields already on `AlertEvaluationInput`. No schema, IPC, or renderer change was needed — the [US-51 management queue](us-51-management-queue-dashboard.md) displays the new rule code transparently, and the [US-50 evaluation job](us-50-alert-engine.md) handles firing, updating, and resolution.

## Acceptance criteria

- Alert fires when the stock rises above the covered-call strike (MSFT `CC_OPEN` at $420.00 strike, price $427.40 → medium-urgency `COVERED_CALL_BREACH`, summary exactly `Stock is 1.8% above the $420.00 call strike — shares may be called away`)
- Alert does not fire while the stock is below the covered-call strike (MSFT `CC_OPEN` at $420.00, price $416.00 → no alert)
- Alert resolves when the stock falls back below the strike (open alert at $427.40, next evaluation at $415.00 → marked resolved)
- Cash-secured-put positions do not use this covered-call breach rule (AAPL `CSP_OPEN` at $180.00, price $185.00 → no `COVERED_CALL_BREACH` alert)
- Holding-shares positions without an open call are not evaluated (TSLA `HOLDING_SHARES`, no open call → not evaluated)

Each AC has exactly one named e2e test in `src/main/services/evaluate-alerts.e2e.test.ts` (`describe('US-62 acceptance — COVERED_CALL_BREACH')`). Unit coverage lives in `src/main/core/alerts.test.ts` (`describe('evaluatePosition — COVERED_CALL_BREACH (US-62)')`), including the exact-at-strike 0.0% boundary and the co-fire-with-DTE-rules case.

## What was built

**Rule.** `COVERED_CALL_BREACH` is a pure registry entry in `src/main/core/alerts.ts`, following the [alert rule registry pattern](../architecture/02-adrs/alert-rule-registry.md). Urgency `medium`, quick action `Review position`, restricted to `CC_OPEN`. Predicate:

```
phase === 'CC_OPEN' && strike !== null && currentUnderlyingPrice !== null && price >= strike
```

The `>=` boundary means the alert fires the moment the call reaches at-the-money (0.0% above). It co-fires independently of the DTE rules ([EXPIRATION_IMMINENT / MANAGEMENT_WINDOW](us-50-alert-engine.md)) per the [global alert-resolution / co-firing model](../domain/alerts.md) — a covered call can be both breached and inside the expiration window, and each rule keeps its own queue row. Skip reason: `missing_underlying_price` when a `CC_OPEN` position has `currentUnderlyingPrice === null`, so an open alert is kept open (not resolved) when the price feed is unavailable.

**Percent-above.** The summary reuses the existing `proximityPercent` helper — `(price − strike) / strike × 100` as an absolute value. Because the rule only fires at `price ≥ strike`, the absolute percent equals the signed percent-above, so no new signed helper was introduced. The summary is `Stock is {pct}% above the {strike} call strike — shares may be called away`, with `{pct}` as `.toFixed(1)` and `{strike}` via `formatStrike` (`$` + 2dp).

**Shared input slice.** The refactor extracted `PriceVsStrikeInput = Pick<AlertEvaluationInput, 'strike' | 'currentUnderlyingPrice'>` as the shared shape for the two price-vs-strike rules; `StrikeProximityInput` (US-55) and `CoveredCallBreachInput` (US-62) are aliases of it, and `proximityPercent` is typed to `PriceVsStrikeInput`. This makes the shared helper's contract rule-neutral rather than a structural coincidence, while keeping the per-rule named slices consistent with the sibling rules.

**No new production surface beyond the pure engine.** The evaluable-position query (`EVALUABLE_QUERY`) already restricts to `ACTIVE` positions in `CSP_OPEN` / `CC_OPEN` with an active short-option leg, which excludes `HOLDING_SHARES`. Firing (`upsertOpenAlert`), updating an existing open alert, and resolution (`resolveAlertsNotIn` when no match and no skip; `skippedKeys` keeping an alert open on a skip) are all the existing US-50 service paths — the e2e tests exercise them against the new rule.

## Architecture decisions

### Rule shape — CC-only, medium urgency, `price ≥ strike`, co-fires with DTE rules

- **Decision:** `urgency: 'medium'`, quick action `Review position`, applies to `CC_OPEN` only, fires at `price ≥ strike`, skips with `missing_underlying_price` when the price is absent. Co-fires independently of the DTE rules.
- **Why:** Urgency and summary template come verbatim from the story ACs. The breach is the covered-call counterpart to US-55's CSP strike-proximity — a breached call is a "good problem" that still demands a roll-vs-call-away decision, and the `≥` boundary fires the instant the call goes ATM. Co-firing follows the US-53/54/55/56 decision — orthogonal conditions, no AC asks for suppression. Extending US-55's `STRIKE_PROXIMITY` was rejected: proximity is a two-sided band, breach is a one-sided trigger. PMCC short-call-against-LEAPS assignment is a structurally different concern deferred to Epic 09.

### Shared `PriceVsStrikeInput` slice for the two price-vs-strike rules

- **Decision:** `PriceVsStrikeInput` is the shared `Pick`; `StrikeProximityInput` and `CoveredCallBreachInput` alias it; `proximityPercent` is typed to it.
- **Why:** Makes the shared helper rule-neutral and the shared shape explicit rather than an implicit structural match, while preserving per-rule named slices per the established narrow-Pick helper-input convention. See [alerts](../domain/alerts.md).

## Contracts touched

None. The story adds no new IPC surface; the renderer reads new alerts through the existing `alerts:list` channel unchanged, and the new `rule_code` value flows through transparently.

### Schema

None. The story reuses the [US-50 `alerts` table](us-50-alert-engine.md) — `rule_code` is plain `TEXT` with no CHECK constraint, so `'COVERED_CALL_BREACH'` is just a new value under the existing [partial-unique open-alert index](../architecture/02-adrs/alerts-partial-unique-open.md). No migration.

## Source files

- `src/main/core/alerts.ts` — `RuleCode` union member, `PriceVsStrikeInput` shared type, `CoveredCallBreachInput` alias, `coveredCallBreachSummary` helper, `RULES` registry entry; `proximityPercent` retyped to the shared input
- `src/main/services/evaluate-alerts.e2e.test.ts` — one named e2e test per AC (`describe('US-62 acceptance — COVERED_CALL_BREACH')`)

<!-- /generated -->

<!-- Hand-written notes below this line are preserved across regeneration. -->
