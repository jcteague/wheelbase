# Data Model: US-59 — Dismiss an alert with a record of the dismissal

## Entity: `alerts` (existing table, extended)

Migration `011_add_alerts_dismissal.sql` adds one column and one partial unique
index. No other schema changes.

| Field               | Type           | Notes                                                                                                                                                                  |
| ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                | TEXT PK        | unchanged                                                                                                                                                              |
| `position_id`       | TEXT           | unchanged                                                                                                                                                              |
| `rule_code`         | TEXT           | unchanged                                                                                                                                                              |
| `urgency`           | TEXT           | unchanged                                                                                                                                                              |
| `summary`           | TEXT           | unchanged                                                                                                                                                              |
| `quick_action`      | TEXT           | unchanged                                                                                                                                                              |
| `status`            | TEXT           | now actively takes the value `'dismissed'` at runtime (the type already allowed it — `AlertStatus = 'open' \| 'resolved' \| 'dismissed'` in `src/main/core/alerts.ts`) |
| `triggered_at`      | TEXT           | unchanged                                                                                                                                                              |
| `last_evaluated_at` | TEXT           | unchanged                                                                                                                                                              |
| `resolved_at`       | TEXT, nullable | **now also set** when a dismissed row's condition clears (dismissed → resolved transition)                                                                             |
| **`dismissed_at`**  | TEXT, nullable | **new column.** Set once, when `status` transitions `open → dismissed`. Never cleared — permanent audit marker even if the row later moves to `resolved`.              |
| `created_at`        | TEXT           | unchanged                                                                                                                                                              |
| `updated_at`        | TEXT           | unchanged                                                                                                                                                              |

### New index

```sql
CREATE UNIQUE INDEX idx_alerts_dismissed_unique
  ON alerts (position_id, rule_code) WHERE status = 'dismissed';
```

Mirrors the existing `idx_alerts_open_unique` partial index: at most one
"blocking" dismissed row per `(position_id, rule_code)` at any time, while any
number of historical resolved/dismissed rows accumulate for the same pair over
the position's lifetime.

## State transitions

Extends the existing lifecycle documented in `docs/spec/domain/alerts.md`
("Alert lifecycle"):

```
(none) ──match──▶ open ──match again──▶ open (updated in place)
  open ──dismiss (user action)──▶ dismissed
  dismissed ──condition clears (rule evaluated, no longer matches)──▶ resolved
  open ──condition clears──▶ resolved                        (unchanged, US-50)
  resolved ──match again──▶ (none, new row) open              (unchanged, US-50)
```

Rules:

- **`open → dismissed`**: only transition triggered directly by the trader (via
  `alerts:dismiss`). Sets `status = 'dismissed'`, `dismissed_at = now`,
  `updated_at = now`. `triggered_at` is untouched.
- **`dismissed → resolved`**: triggered automatically by the evaluation job
  (`clearStaleDismissals`, run inside the same persist transaction as
  `resolveAlertsNotIn`) when the rule for that `(position_id, rule_code)` was
  genuinely evaluated this run (present in `keepOpenKeys`'s complement — i.e. not
  matched and not skipped for missing data) and did not match. Sets
  `status = 'resolved'`, `resolved_at = now`, `updated_at = now`. `dismissed_at`
  is preserved.
- **`dismissed → dismissed` (blocked re-open)**: while a dismissed row exists for
  a key, `upsertOpenAlert` must not insert or update — it returns `'suppressed'`
  and leaves the row untouched. This is what keeps a still-true condition from
  reappearing (Scenario 2).
- **Illegal: dismissing a non-`open` row**: rejected with `AlertError('NOT_OPEN',
'Only open alerts can be dismissed')` (Scenario 4). Dismissing a nonexistent
  `alertId` is rejected with `AlertError('NOT_FOUND', 'Alert {id} not found')`.

## Validation rules

- `dismissAlert(db, alertId, now)`:
  - `alertId` must reference an existing row → else `NOT_FOUND`.
  - The row's current `status` must be exactly `'open'` → else `NOT_OPEN`
    (message: `Only open alerts can be dismissed`). This covers both
    `'resolved'` and `'dismissed'` current states with the same message, per the
    AC — the story does not distinguish "already resolved" from "already
    dismissed" in its rejection wording.
- No new renderer-side Zod schema is required beyond the IPC payload shape
  (`alertId: string`, non-empty) — there is no form involved, just a confirm
  click.

## View-model (no new type needed)

`ManagementQueueItem` (`src/main/schemas.ts`) is unchanged. Once an alert is
dismissed, `listManagementQueue` (filters `status = 'open'`) naturally excludes
it — no read-path change required for the queue to stop showing it.
