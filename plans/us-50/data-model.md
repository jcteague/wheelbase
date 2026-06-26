# Data Model: US-50 — Alert engine & persistence

## New persisted entity: `alerts`

Migration: `migrations/009_create_alerts.sql`

| Column              | Type    | Notes                                                                                 |
| ------------------- | ------- | ------------------------------------------------------------------------------------- |
| `id`                | TEXT PK | UUID, generated in the service layer (`crypto.randomUUID()` — same as other entities) |
| `position_id`       | TEXT    | `NOT NULL REFERENCES positions(id)`                                                   |
| `rule_code`         | TEXT    | `NOT NULL` — one of the rule codes below                                              |
| `urgency`           | TEXT    | `NOT NULL` — `high` \| `medium` \| `low`                                              |
| `summary`           | TEXT    | `NOT NULL` — human-readable queue text (e.g. `Expires in 5 days at $180.00 strike`)   |
| `quick_action`      | TEXT    | `NOT NULL` — queue button label (Phase 3: always `Review position`)                   |
| `status`            | TEXT    | `NOT NULL DEFAULT 'open'` — `open` \| `resolved` \| `dismissed`                       |
| `triggered_at`      | TEXT    | `NOT NULL` — ISO timestamp of first firing; **never mutated** while the alert is open |
| `last_evaluated_at` | TEXT    | `NOT NULL` — ISO timestamp of the most recent evaluation that re-matched this alert   |
| `resolved_at`       | TEXT    | nullable — set when `status` transitions to `resolved`                                |
| `created_at`        | TEXT    | `NOT NULL`                                                                            |
| `updated_at`        | TEXT    | `NOT NULL`                                                                            |

### Indexes

```sql
-- At most one OPEN alert per (position, rule); historical resolved/dismissed
-- rows for the same pair are allowed (audit trail + re-firing after resolve).
CREATE UNIQUE INDEX idx_alerts_open_unique
  ON alerts (position_id, rule_code) WHERE status = 'open';

-- Open management-queue read path (US-51 will consume this).
CREATE INDEX idx_alerts_status_urgency
  ON alerts (status, urgency);
```

### State transitions

```
(none) --[rule matches]--> open
open   --[rule re-matches on next run]--> open   (triggered_at preserved, last_evaluated_at + summary updated)
open   --[rule no longer matches]--> resolved     (resolved_at set; row retained)
resolved --[rule matches again later]--> (new) open row   (old resolved row retained)
open   --[trader dismisses, US-59]--> dismissed   (out of scope for US-50; status domain reserved)
```

Resolution and dismissal are **status changes only — rows are never deleted.**

---

## Rule codes (US-50 scope)

| `rule_code`           | Urgency  | Trigger condition (US-50)           | Summary template                                 | Quick action      |
| --------------------- | -------- | ----------------------------------- | ------------------------------------------------ | ----------------- |
| `EXPIRATION_IMMINENT` | `high`   | active option leg, `dte <= 5`       | `Expires in {dte} days at ${strike} strike`      | `Review position` |
| `MANAGEMENT_WINDOW`   | `medium` | active option leg, `6 <= dte <= 21` | `{dte} DTE remaining — review for roll or close` | `Review position` |

- `{strike}` is formatted to 2 decimals with a leading `$` (e.g. `$180.00`) via `decimal.js`.
- `EXPIRATION_IMMINENT` takes precedence: when `dte <= 5`, `MANAGEMENT_WINDOW` does not fire.
- Reserved for later stories (designed-for, not built in US-50): `PROFIT_TARGET` (US-54), `STRIKE_PROXIMITY` (US-55), `EARNINGS_PROXIMITY` (US-56), `COVERED_CALL_BREACH` (US-62).

---

## In-memory / engine types (pure — `src/main/core/`)

In `src/main/core/types.ts` (or a new `src/main/core/alerts.ts` local exports):

```typescript
export type AlertUrgency = 'high' | 'medium' | 'low'
export type AlertStatus = 'open' | 'resolved' | 'dismissed'
export type RuleCode = 'EXPIRATION_IMMINENT' | 'MANAGEMENT_WINDOW'
// (future: 'PROFIT_TARGET' | 'STRIKE_PROXIMITY' | 'EARNINGS_PROXIMITY' | 'COVERED_CALL_BREACH')

// Input the engine evaluates — plain values only, no DB rows.
export interface AlertEvaluationInput {
  positionId: string
  ticker: string
  phase: WheelPhase
  instrumentType: 'PUT' | 'CALL' | null
  strike: string | null // 4dp TEXT as stored on the leg
  dte: number | null // calendar days to expiration; null when unknown
  managementWindowDte: number // defaults to DEFAULT_MANAGEMENT_WINDOW_DTE (21)
}

export interface AlertMatch {
  ruleCode: RuleCode
  urgency: AlertUrgency
  summary: string
  quickAction: string
}

export interface SkippedRule {
  ruleCode: RuleCode
  reason: string // e.g. 'missing_dte'
}

export interface PositionEvaluation {
  matches: AlertMatch[]
  skipped: SkippedRule[]
}
```

## Persistence / service types (`src/main/schemas.ts`)

```typescript
export interface AlertRecord {
  id: string
  positionId: string
  ruleCode: string
  urgency: AlertUrgency
  summary: string
  quickAction: string
  status: AlertStatus
  triggeredAt: string
  lastEvaluatedAt: string
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

// Returned by the evaluation job for logging + tests (mirrors CollectIVRSnapshotsResult).
export interface EvaluateAlertsResult {
  createdCount: number // new open alerts inserted
  updatedCount: number // existing open alerts re-matched (in-place update)
  resolvedCount: number // open alerts marked resolved this run
  skippedRuleCount: number // rules skipped for missing data (logged at DEBUG)
}
```

---

## Evaluable-position selection logic

Only positions with an **active short option leg** are evaluable. Reuse the
phase-aware `activeLegSubquery()` from `src/main/services/active-leg-sql.ts`,
restricted to option-bearing phases.

```sql
SELECT
  p.id   AS position_id,
  p.ticker,
  p.phase,
  l.instrument_type,
  l.strike,
  l.expiration
FROM positions p
JOIN legs l ON l.id = (
  -- activeLegSubquery(): newest CSP_OPEN/ROLL_TO (CSP_OPEN phase) or
  -- CC_OPEN/ROLL_TO (CC_OPEN phase) leg
  ...
)
WHERE p.status = 'ACTIVE'
  AND p.phase IN ('CSP_OPEN', 'CC_OPEN')
```

- A `JOIN` (not `LEFT JOIN`) on the active-leg subquery drops positions with no
  active option leg — e.g. `HOLDING_SHARES` with no open covered call (TSLA in
  the AC) is naturally excluded.
- `dte` is computed from `l.expiration` via the shared `computeDte` helper
  (`src/main/core/dte.ts`).

---

## Validation rules (from acceptance criteria)

- An alert row stores all eight fields named in US-50 AC #1: position id, rule
  code, urgency tier, summary, quick action, status, `triggered_at`,
  `last_evaluated_at`.
- Re-matching an open alert must **preserve `triggered_at`** and **update
  `last_evaluated_at`** (and `summary`, which carries the live DTE count).
- A run must produce **at most one** open row per `(position_id, rule_code)`
  (enforced by `idx_alerts_open_unique`).
- Resolution sets `status='resolved'` + `resolved_at`; the row is retained and
  excluded from open-queue reads.
- A skipped rule (missing data) produces **no** alert row and a DEBUG log entry;
  it must not affect other positions' alerts, and a compute error must not leave
  partially written rows (single-transaction persist).
