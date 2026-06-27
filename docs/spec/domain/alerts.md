# Management Alerts

<!-- generated:from us-50,us-51 -->

## Overview

Management alerts are the queue of "something needs your attention" signals the
app raises against active wheel positions. A scheduled job evaluates every active
CSP/CC position against a set of built-in rules and persists the results in the
`alerts` table, where each alert is deduplicated per `(position, rule)`, updated
in place while its condition holds, and resolved (never deleted) once the
condition clears. The evaluation engine is a pure function; persistence,
scheduling, and logging live in the service and main-process layers around it.

US-50 establishes this backbone with two rules — `EXPIRATION_IMMINENT` (the
active option leg has DTE ≤ 5) and `MANAGEMENT_WINDOW` (6 ≤ DTE ≤ the
management-window threshold, default 21). The engine and table are built
open/closed so later Classic Wheel rules (`PROFIT_TARGET`, `STRIKE_PROXIMITY`,
`EARNINGS_PROXIMITY`, `COVERED_CALL_BREACH`) and the renderer-facing queue
(US-51) attach without schema or control-flow changes.

US-51 adds the read/display half: a `listManagementQueue` read path that enriches
the persisted open alerts with their position's `ticker` and `phase` and sorts
them by urgency for the dashboard "management queue". No engine or schema work is
required — it consumes the US-50 table as-is.

<!-- /generated -->

<!-- generated:from us-50 -->

## Built-in rules

Each rule is a pure predicate over a position's current active option leg.

| Rule code             | Urgency | Triggers when                                           | Summary template                                 | Quick action      |
| --------------------- | ------- | ------------------------------------------------------- | ------------------------------------------------ | ----------------- |
| `EXPIRATION_IMMINENT` | high    | active leg `dte ≤ 5`                                    | `Expires in {dte} days at ${strike} strike`      | `Review position` |
| `MANAGEMENT_WINDOW`   | medium  | active leg `6 ≤ dte ≤ managementWindowDte` (default 21) | `{dte} DTE remaining — review for roll or close` | `Review position` |

`{strike}` is formatted to two decimals with a leading `$` via `decimal.js`
(`new Decimal(strike).toFixed(2)`). The two rules use mutually-exclusive DTE
ranges, so `EXPIRATION_IMMINENT` takes precedence inside 5 DTE without a
post-filter and the same leg never produces both alerts. DTE is computed by the
shared `computeDte` helper (`src/main/core/dte.ts`) so queue messaging stays
consistent with the positions list.

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
open alert whose `(position_id, rule_code)` key is absent from this run's matched
set as resolved — including alerts for positions that are no longer evaluable
(closed, or now lacking an active option leg). A position-scoped resolution would
leak open alerts for closed positions.

<!-- /generated -->

<!-- generated:from us-50,us-51 -->

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

<!-- generated:from us-50,us-51 -->

## Driven by

- [US-50 — Scheduled alert-rule evaluation engine](../features/us-50-alert-engine.md)
- [US-51 — Management queue dashboard](../features/us-51-management-queue-dashboard.md)

<!-- /generated -->

<!-- Hand-written sections live below — do not touch -->
