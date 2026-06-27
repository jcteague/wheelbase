# Data Model: US-51 — Management Queue Dashboard

US-51 adds **no schema migrations**. It reads the existing `alerts` table
(US-50, `migrations/009_create_alerts.sql`) joined to `positions`, and projects
the result into a new view-model.

---

## Source tables (read-only, unchanged)

### `alerts` (US-50)

| column              | type           | notes                                            |
| ------------------- | -------------- | ------------------------------------------------ |
| `id`                | TEXT (uuid) PK | becomes `alertId` in the view-model              |
| `position_id`       | TEXT FK        | → `positions.id`                                 |
| `rule_code`         | TEXT           | e.g. `EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`  |
| `urgency`           | TEXT           | `high` \| `medium` \| `low`                      |
| `summary`           | TEXT           | trader-language trigger text, displayed verbatim |
| `quick_action`      | TEXT           | button label, currently `Review position`        |
| `status`            | TEXT           | filter on `'open'`                               |
| `triggered_at`      | TEXT (ISO)     | immutable; secondary sort key                    |
| `last_evaluated_at` | TEXT (ISO)     | not surfaced by the queue                        |
| `resolved_at`       | TEXT \| null   | not surfaced                                     |
| `created_at`        | TEXT (ISO)     | not surfaced                                     |
| `updated_at`        | TEXT (ISO)     | not surfaced                                     |

Index used: `idx_alerts_status_urgency (status, urgency)`.

### `positions` (existing)

Only `id`, `ticker`, and `phase` are read (to enrich each queue row).

---

## View-model: `ManagementQueueItem`

New interface in `src/main/schemas.ts`, mirrored in `src/preload/index.d.ts`,
and re-exported from `src/renderer/src/api/alerts.ts`.

```typescript
export interface ManagementQueueItem {
  alertId: string // alerts.id — stable React key
  positionId: string // alerts.position_id — navigation target
  ticker: string // positions.ticker
  phase: WheelPhase // positions.phase — drives PhaseBadge
  urgency: AlertUrgency // 'high' | 'medium' | 'low'
  summary: string // alerts.summary, displayed verbatim
  quickAction: string // alerts.quick_action, e.g. 'Review position'
  triggeredAt: string // alerts.triggered_at (ISO)
}
```

`WheelPhase` and `AlertUrgency` are existing exported types
(`src/main/core/types.ts` and `src/main/core/alerts.ts` respectively).

---

## Selection & ordering logic

`listManagementQueue(db)` query shape:

```sql
SELECT
  a.id           AS alert_id,
  a.position_id  AS position_id,
  p.ticker       AS ticker,
  p.phase        AS phase,
  a.urgency      AS urgency,
  a.summary      AS summary,
  a.quick_action AS quick_action,
  a.triggered_at AS triggered_at
FROM alerts a
JOIN positions p ON p.id = a.position_id
WHERE a.status = 'open'
ORDER BY
  CASE a.urgency WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
  a.triggered_at ASC
```

- **Filter:** only `status = 'open'` alerts appear.
- **JOIN:** inner join drops any alert whose position is missing (should not
  happen given the FK, but keeps the result well-formed).
- **Primary sort:** urgency tier — `high` < `medium` < `low`.
- **Secondary sort:** `triggered_at` ascending — oldest-outstanding first within
  a tier (see research ADR).

Maps snake_case rows → `ManagementQueueItem` (camelCase), identical in spirit to
`mapAlertRow` in `src/main/services/alerts.ts`.

---

## Validation rules (from acceptance criteria)

- The queue returns **one row per open alert** (US-51 scope; no grouping by
  position).
- An empty result set (no open alerts) is valid and drives the empty state — it
  is not an error.
- Ordering must place `high` before `medium` before `low` (AC scenario 1).
- Each item must expose `ticker`, `phase`, `summary`, and `quickAction` so the
  row can render ticker, phase badge, trigger summary, and the action button
  (AC scenario 2).
- `positionId` must resolve to the position detail route `/positions/:id`
  (AC scenario 3).

---

## State transitions

None. US-51 is a read/display feature. Alert lifecycle
(`open → resolved/dismissed`) is owned by US-50's evaluation job and future
US-59 (dismiss).
