# Management Alerts

<!-- generated:from us-50,us-51,us-52,us-53-54-55 -->

## Overview

Management alerts are the queue of "something needs your attention" signals the
app raises against active wheel positions. A scheduled job evaluates every active
CSP/CC position against a set of built-in rules and persists the results in the
`alerts` table, where each alert is deduplicated per `(position, rule)`, updated
in place while its condition holds, and resolved (never deleted) once the
condition clears. The evaluation engine is a pure function; persistence,
scheduling, market-data fetching, and logging live in the service and
main-process layers around it.

US-50 establishes this backbone with two DTE rules — `EXPIRATION_IMMINENT` (the
active option leg has `0 ≤ DTE ≤ 5`) and `MANAGEMENT_WINDOW` (6 ≤ DTE ≤ the
management-window threshold, default 21). The engine and table are built
open/closed so additional Classic Wheel rules and the renderer-facing queue
(US-51) attach without schema or control-flow changes.

US-53/54/55 land the first three Classic Wheel rules on top of that backbone:
`MANAGEMENT_WINDOW` now spans US-50 (engine implementation) plus US-53 (AC-driven
verification), while `PROFIT_TARGET` (US-54) and `STRIKE_PROXIMITY` (US-55) are
newly shipped — they are no longer "later" rules. Because the latter two need
live prices, `evaluateAlerts` became **async** with an injected market-data
provider dependency: the service pre-fetches live option mids and underlying
prices at the boundary and passes plain values into the still-pure engine.
(`EARNINGS_PROXIMITY` and `COVERED_CALL_BREACH` remain future rules — the latter
is US-62.)

US-51 adds the read/display half: a `listManagementQueue` read path that enriches
the persisted open alerts with their position's `ticker` and `phase` and sorts
them by urgency for the dashboard "management queue". No engine or schema work is
required — it consumes the US-50 table as-is, and new rule codes flow through it
transparently.

US-52 formalizes `EXPIRATION_IMMINENT` as its own high-urgency rule and pins down
its contract: it fires only inside the final five days (`0 ≤ DTE ≤ 5`) on active
short option legs, its threshold is a fixed built-in (independent of the
configurable management window), and it stays mutually exclusive with
`MANAGEMENT_WINDOW`. The behavior already existed in the US-50 registry, so US-52
required no new migration, IPC channel, or renderer contract — the work was
regression hardening (direct core/service/e2e coverage) around the existing rule.

<!-- /generated -->

<!-- generated:from us-50,us-52,us-53-54-55 -->

## Built-in rules

Each rule is a pure predicate over a position's current active option leg (plus,
for the market-data rules, the pre-fetched live prices).

| Rule code             | Urgency | Applies to                    | Triggers when                                           | Summary template                                          | Quick action      |
| --------------------- | ------- | ----------------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ----------------- |
| `EXPIRATION_IMMINENT` | high    | any open short leg (CSP / CC) | active leg `0 ≤ dte ≤ 5`                                | `Expires in {dte} days at ${strike} strike`               | `Review position` |
| `MANAGEMENT_WINDOW`   | medium  | any open short leg (CSP / CC) | active leg `6 ≤ dte ≤ managementWindowDte` (default 21) | `{dte} DTE remaining — review for roll or close`          | `Review position` |
| `PROFIT_TARGET`       | low     | any open short leg (CSP / CC) | captured profit `% ≥ target` (default 50%)              | `{pct}% of max profit captured — consider closing`        | `Review position` |
| `STRIKE_PROXIMITY`    | medium  | CSP only (`CSP_OPEN`)         | `proximityPct = \|price − strike\| / strike × 100 ≤ 1`  | `Stock is {pct}% {above\|below} the ${strike} put strike` | `Review position` |

`{strike}` is formatted to two decimals with a leading `$` via `decimal.js`
(`new Decimal(strike).toFixed(2)`); `{pct}` is formatted to one decimal. The two
DTE rules use mutually-exclusive DTE ranges, so `EXPIRATION_IMMINENT` takes
precedence inside 5 DTE without a post-filter and the same leg never produces both
alerts — at 6 DTE the imminent rule does **not** fire and `MANAGEMENT_WINDOW`
fires instead. `EXPIRATION_IMMINENT`'s `0 ≤ dte ≤ 5` bound is a fixed built-in
threshold (`EXPIRATION_IMMINENT_MAX_DTE = 5` in `src/main/core/alerts.ts`),
deliberately independent of the configurable `managementWindowDte`; a leg with
`dte === null` skips with reason `missing_dte` rather than matching. DTE is
computed by the shared `computeDte` helper (`src/main/core/dte.ts`) so queue
messaging stays consistent with the positions list.

`PROFIT_TARGET` captured-percent is `computeUnrealizedPnl`'s `pnlPercent` compared
against the resolved target (per-position override, else the 50% default). It
co-fires with the DTE rules — a position can hold an open `PROFIT_TARGET` and an
open `EXPIRATION_IMMINENT` at once (distinct rule codes → distinct rows).

`STRIKE_PROXIMITY` is CSP-only and direction-aware: the summary states whether the
underlying is `above` or `below` the put strike (by `price >= strike`), and the
below-strike case appends `" — now in the money"` because that is the genuine
assignment-risk direction. Covered-call breach is a separate future rule (US-62),
so `CC_OPEN` positions produce no `STRIKE_PROXIMITY` match and no skip.

<!-- /generated -->

<!-- generated:from us-50 -->

## Alert lifecycle

A single alert row moves through these states (rows are never deleted — the
table is an audit trail):

- **(none) → open** — a rule matches a position for the first time;
  `triggered_at = last_evaluated_at = now`, `status = 'open'`.
- **open → open** — the rule still matches on a later run; the existing row is
  updated in place. `triggered_at` is preserved; `last_evaluated_at`, `summary`,
  `urgency`, and `quick_action` are refreshed. No duplicate row is created (the
  partial unique index enforces this).
- **open → resolved** — the rule no longer matches (condition cleared, leg
  closed/expired, or rolled to a longer DTE). `status = 'resolved'`,
  `resolved_at = now`; the row drops out of open-queue reads but is retained.
- **resolved → (new) open** — if the rule fires again later, a fresh open row is
  inserted; the prior resolved row stays intact (distinct `triggered_at`
  history).
- **open → dismissed** — reserved for US-59; out of scope for US-50.

Resolution is **global**: on each run the persist phase marks every currently
open alert whose `(position_id, rule_code)` key is absent from this run's
**keep-open** set as resolved — including alerts for positions that are no longer
evaluable (closed, or now lacking an active option leg). A position-scoped
resolution would leak open alerts for closed positions. The keep-open set is the
union of this run's matched keys **and** the keys of rules skipped for missing
data: a skipped rule was never evaluated, so treating it as cleared would resolve
then reopen the alert with a fresh `triggered_at` on a transient snapshot gap
(e.g. a single absent option mid → `missing_option_mark`).

<!-- /generated -->

<!-- generated:from us-53-54-55 -->

## Skip reasons & missing-data handling

A rule that cannot evaluate because a required input is absent records a
`SkippedRule { ruleCode, reason }` instead of matching or throwing; the service
logs each skip at DEBUG (`alert_rule_skipped`). US-50 shipped this for DTE; the
market-data rules generalized it from a single `requiresDte` boolean into a
per-rule `missingData` function that returns a reason string (or `null` to
proceed). Each rule owns its own guard, so one rule's missing input never
suppresses another's alert. The four reason strings and the rule each guards:

| Reason string                 | Rule guarded                               | Fires when                                                                                |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `missing_dte`                 | `EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW` | `dte` is null (expiration unknown)                                                        |
| `missing_option_mark`         | `PROFIT_TARGET`                            | entry premium, contracts, or the live option mid is absent                                |
| `invalid_profit_target_input` | `PROFIT_TARGET`                            | premium is non-positive or contracts is not a positive integer (would throw the P&L math) |
| `missing_underlying_price`    | `STRIKE_PROXIMITY`                         | position is `CSP_OPEN` and the live underlying price is absent                            |

`invalid_profit_target_input` came from the post-review hardening pass: without it
a stored non-positive premium/contracts would make `computeUnrealizedPnl` throw
and cost the whole position its alerts. The guard rejects those inputs cleanly so
the position's other rules (notably the DTE rules) still evaluate.

<!-- /generated -->

<!-- generated:from us-53-54-55 -->

## Live market-data enrichment & failure isolation

`PROFIT_TARGET` and `STRIKE_PROXIMITY` need live prices, but the engine must stay
pure — so the service (`evaluate-alerts.ts`) enriches at the boundary and passes
plain string values (`currentOptionMid`, `currentUnderlyingPrice`) into the
engine. Per run, the compute phase builds each evaluable leg's OCC symbol once,
then issues one batched `fetchStockQuotes` for the distinct tickers and one
batched `fetchOptionSnapshots` for the distinct OCC symbols. Both fetches run
**concurrently** under `Promise.all`, and each is wrapped so that on failure it
**degrades to empty** rather than rejecting — DTE rules, which need no market
data, always evaluate. OCC-symbol building is non-throwing: a leg that cannot form
a valid symbol yields `null` (that leg's `PROFIT_TARGET` skips) without aborting
the batch.

The guiding invariant, established by the post-review hardening pass: **one bad
leg, one bad position, or a whole-provider outage must never suppress healthy
positions' alerts** — especially the high-urgency DTE rules. The failure paths and
their log events:

- `alert_evaluation_stock_quotes_unavailable` (WARN) — the stock-quote feed threw;
  underlying prices degrade to empty, so CSP `STRIKE_PROXIMITY` skips but DTE rules
  still fire.
- `alert_evaluation_option_snapshots_unavailable` (WARN) — the option-snapshot feed
  threw; option mids degrade to empty, so `PROFIT_TARGET` skips but DTE rules still
  fire.
- `alert_evaluation_occ_symbol_invalid` (WARN) — one leg's ticker/strike/expiration
  can't form an OCC symbol; that leg gets `currentOptionMid = null` and its DTE
  rules still fire.
- `alert_rule_skipped` (DEBUG) — a rule skipped for one of the missing-data reasons
  above.
- `alert_evaluation_failed` (ERROR) — a single position threw mid-compute; caught
  per-position so the persist phase still runs for the rest (unchanged US-50
  behavior).

<!-- /generated -->

<!-- generated:from us-50,us-51,us-53-54-55 -->

## Key decisions

### Pure engine returns matches and skips

- **Decision:** `evaluatePosition` is a pure function returning
  `{ matches, skipped }`; a rule that can't evaluate (missing input) records a
  `SkippedRule { ruleCode, reason }` instead of throwing, and the service logs
  skips at DEBUG.
- **Why:** Keeps `src/main/core/` side-effect-free and stops one rule's missing
  data from aborting evaluation of the rest.
- **Driven by:** [us-50](../features/us-50-alert-engine.md) ·
  [alert-engine-pure-matches-skips](../architecture/02-adrs/alert-engine-pure-matches-skips.md)

### Rules as an ordered open/closed registry

- **Decision:** Rules live in a `RULES: RuleDefinition[]` registry; evaluation is
  a generic two-filter pass. Precedence is expressed by exclusive DTE ranges, not
  ordering-dependent early returns.
- **Why:** Later rules append to the array without touching evaluation logic or
  re-reasoning about precedence.
- **Driven by:** [us-50](../features/us-50-alert-engine.md) ·
  [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md)

### Partial unique index on open status

- **Decision:** `UNIQUE (position_id, rule_code) WHERE status = 'open'`
  guarantees at most one open alert per (position, rule) while allowing any number
  of historical resolved/dismissed rows.
- **Why:** Re-evaluation must update in place, resolution must never delete, and a
  later re-firing must create a new open row — full uniqueness would block that.
- **Driven by:** [us-50](../features/us-50-alert-engine.md) ·
  [alerts-partial-unique-open](../architecture/02-adrs/alerts-partial-unique-open.md)

### Compute, then persist atomically

- **Decision:** Compute all matches/skips outside any transaction (per-position
  `try/catch`), then upsert + resolve inside one `db.transaction`.
- **Why:** No partial writes if a single position errors; the write set is atomic.
- **Driven by:** [us-50](../features/us-50-alert-engine.md) ·
  [alert-compute-then-persist](../architecture/02-adrs/alert-compute-then-persist.md)

### Reuse the polling scheduler

- **Decision:** One `alert-evaluation` job on the shared US-46 scheduler with an
  interval cadence (60 s open / 5 min extended / parked when closed); not
  broker-gated.
- **Why:** Alerts must reflect intraday state on the polling cadence; the DTE
  rules need no broker credentials.
- **Driven by:** [us-50](../features/us-50-alert-engine.md) ·
  [alert-evaluation-job-cadence](../architecture/02-adrs/alert-evaluation-job-cadence.md)

### Dedicated enriched, sorted management-queue read path

- **Decision:** A new `listManagementQueue(db)` joins open `alerts` to
  `positions` to attach `ticker` and `phase`, sorts by urgency tier
  (high → medium → low) then `triggered_at` ASC, and projects into a
  purpose-built `ManagementQueueItem` view-model — rather than reusing or
  extending the `listOpenAlerts` primitive.
- **Why:** The queue UI needs fields the `alerts` row lacks and an ordering the
  raw primitive doesn't provide; a separate function keeps `listOpenAlerts`'
  contract (relied on by US-50 evaluation tests) stable and keeps "raw open
  alerts" distinct from "display queue".
- **Driven by:** [us-51](../features/us-51-management-queue-dashboard.md) ·
  [management-queue-read-path](../architecture/02-adrs/management-queue-read-path.md)

### Pre-fetch live marks in the service; keep the rule engine pure

- **Decision:** The service batches live option mids and underlying prices at the
  boundary and passes them into the engine as plain strings; the `RULES`
  predicates never call a provider.
- **Why:** Preserves the `src/main/core/` no-I/O rule and keeps predicates
  unit-testable with literal inputs, exactly like the DTE rules; batching keeps one
  provider round-trip per data type per run.
- **Driven by:** [US-53/54/55](../features/us-53-54-55-market-data-alert-rules.md) ·
  [alert-engine-pure-matches-skips](../architecture/02-adrs/alert-engine-pure-matches-skips.md) ·
  [pure-core-engines](../architecture/02-adrs/pure-core-engines.md)

### `evaluateAlerts` becomes async with an injected provider

- **Decision:** `evaluateAlerts` returns `Promise<EvaluateAlertsResult>` and
  accepts an injected `MarketDataProvider` (defaulted from the factory). The
  compute phase awaits the two batched fetches, then runs the existing synchronous
  per-position loop; the persist phase (`db.transaction`) is unchanged.
- **Why:** The provider API is async-only. All awaits stay in the compute phase, so
  no write happens until every fetch and pure evaluation completes — the US-50
  compute-then-persist atomicity ADR still holds.
- **Driven by:** [US-53/54/55](../features/us-53-54-55-market-data-alert-rules.md) ·
  [alert-compute-then-persist](../architecture/02-adrs/alert-compute-then-persist.md)

### Generalize the missing-data skip to a per-rule reason

- **Decision:** Replace the `requiresDte` boolean on `RuleDefinition` with an
  optional `missingData(input) → string | null` that returns a per-rule skip
  reason; `evaluatePosition` records a `SkippedRule` when it is non-null.
- **Why:** The market-data rules need reasons beyond DTE (`missing_option_mark`,
  `missing_underlying_price`, `invalid_profit_target_input`); a single reason
  function keeps each rule self-contained and supplies the DEBUG log string
  directly.
- **Driven by:** [US-53/54/55](../features/us-53-54-55-market-data-alert-rules.md) ·
  [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md) ·
  [alert-engine-pure-matches-skips](../architecture/02-adrs/alert-engine-pure-matches-skips.md)

### `STRIKE_PROXIMITY` is CSP-only and direction-aware

- **Decision:** The rule matches only when `phase === 'CSP_OPEN'`; the summary
  states whether the underlying is above or below the put strike, and the
  below-strike case appends "— now in the money". `CC_OPEN` produces no match and
  no skip.
- **Why:** Matches the US-55 ACs — below-strike is the genuine assignment-risk case;
  covered-call breach is a separate future rule (US-62).
- **Driven by:** [US-53/54/55](../features/us-53-54-55-market-data-alert-rules.md)

### `PROFIT_TARGET` and `STRIKE_PROXIMITY` co-fire with the DTE rules

- **Decision:** The market-data rules are independent of the DTE rules — a position
  may hold an open `PROFIT_TARGET` and an open `EXPIRATION_IMMINENT` at once
  (distinct rule codes → distinct rows). Only `EXPIRATION_IMMINENT` ↔
  `MANAGEMENT_WINDOW` remain mutually exclusive via their DTE windows.
- **Why:** The rules describe orthogonal conditions (opportunity vs. time vs.
  assignment risk); no AC asks to suppress one for another, and hiding an
  actionable profit-taking or assignment signal behind a DTE alert would lose
  information.
- **Driven by:** [US-53/54/55](../features/us-53-54-55-market-data-alert-rules.md) ·
  [alert-rule-registry](../architecture/02-adrs/alert-rule-registry.md)

<!-- /generated -->

<!-- generated:from us-50 -->

## Schema

The `alerts` table (migration `009_create_alerts.sql`) persists every alert with
`triggered_at` / `last_evaluated_at` / `resolved_at` timestamps and a
`status` of `open` | `resolved` | `dismissed`. Two indexes: the partial unique
`idx_alerts_open_unique` and `idx_alerts_status_urgency` for the open-queue read
path. See [Tables](../schema/tables.md) and [Migrations](../schema/migrations.md)
for full column detail.

<!-- /generated -->

<!-- generated:from us-51 -->

## Management-queue read path

`listManagementQueue(db)` (`src/main/services/alerts.ts`) is the display-side
read over the US-50 store. It joins each open `alerts` row to its `positions` row
to add `ticker` and the current `phase`, orders by urgency tier
(high → medium → low) then `triggered_at` ASC, and maps the result into a
`ManagementQueueItem[]` (defined in `src/main/schemas.ts`). It is exposed over the
`alerts:list` IPC channel (`src/main/ipc/alerts.ts`) and read in the renderer via
`src/renderer/src/api/alerts.ts`.

`ManagementQueueItem` is a purpose-built view-model — not the persisted
`AlertRecord`. It carries only `alertId`, `positionId`, `ticker`, `phase`,
`urgency`, `summary`, `quickAction`, and `triggeredAt`, deliberately excluding the
audit fields (`lastEvaluatedAt`, `resolvedAt`, `createdAt`, `updatedAt`,
`status`) that the queue never displays. `alertId` serves as the stable React key
(one row per open alert in US-51 scope). An empty result is valid and drives the
dashboard's empty state.

<!-- /generated -->

<!-- generated:from us-50,us-51,us-52,us-53-54-55 -->

## Driven by

- [US-50 — Scheduled alert-rule evaluation engine](../features/us-50-alert-engine.md)
- [US-51 — Management queue dashboard](../features/us-51-management-queue-dashboard.md)
- [US-52 — Expiration-imminent alert](../features/us-52-expiration-imminent-alert.md)
- [US-53/54/55 — Live market-data alert rules](../features/us-53-54-55-market-data-alert-rules.md)

<!-- /generated -->

<!-- Hand-written sections live below — do not touch -->
