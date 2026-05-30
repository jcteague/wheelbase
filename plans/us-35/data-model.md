# Data Model: Polling Scheduler + Assignment Detection

---

## US-46: PollingScheduler (no database)

In-memory job registry. No persistence.

### Types

```typescript
export type CadencePolicy =
  | {
      kind: 'interval'
      marketOpenMs: number
      extendedHoursMs?: number
      marketClosedMs?: number | null
    }
  | { kind: 'afterClose'; offsetMinutes: number }

export type JobHandler = () => Promise<void>

export type JobConfig = {
  name: string
  cadence: CadencePolicy
  handler: JobHandler
}

export interface PollingScheduler {
  register(config: JobConfig): void
  start(): void
  stop(): Promise<void>
  runNow(jobName: string): Promise<void>
}

export class SchedulerError extends Error {
  readonly code: 'already_registered' | 'job_not_found' | 'not_started'
}
```

### Cadence semantics

| Policy       | Tick selection                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `interval`   | `marketOpenMs` during regular hours; `extendedHoursMs` (if set) during pre/post; `marketClosedMs` (if set) during closed (`null` parks). Initial run on `start()`. |
| `afterClose` | One run per trading day at `(today's market close) + offsetMinutes`. Skip weekends/holidays. Missed runs not backfilled.                                           |

Market session decided per tick via `BrokerProvider.getMarketStatus()`, cached for the duration of the tick to avoid double-calls.

---

## US-35: pending_assignments table

### Migration: `migrations/006_create_pending_assignments.sql`

```sql
CREATE TABLE IF NOT EXISTS pending_assignments (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id     INTEGER NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  leg_id          INTEGER NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  activity_id     TEXT NOT NULL UNIQUE,
  broker_symbol   TEXT NOT NULL,
  qty             INTEGER NOT NULL,
  transaction_time TEXT NOT NULL,                                -- ISO-8601 from broker
  status          TEXT NOT NULL CHECK (status IN ('pending','confirmed','dismissed')),
  detected_at     TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at    TEXT,
  dismissed_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_assignments_status ON pending_assignments(status);
CREATE INDEX IF NOT EXISTS idx_pending_assignments_position ON pending_assignments(position_id);
```

### Migration: `migrations/007_create_app_settings.sql` (if not present)

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

Used to store `assignments_last_poll_at:paper` and `assignments_last_poll_at:live`.

### Service types

```typescript
export type PendingAssignment = {
  id: number
  positionId: number
  legId: number
  activityId: string
  brokerSymbol: string
  qty: number
  transactionTime: string
  status: 'pending' | 'confirmed' | 'dismissed'
  detectedAt: string
  confirmedAt?: string
  dismissedAt?: string
  // Joined display fields
  ticker: string
  strike: string
  expiration: string
  contractType: 'put' | 'call'
}
```

---

## Detection Flow (US-35)

```
PollingScheduler ──► detectAssignments(db, brokerProvider, env)
                       1. Read app_settings["assignments_last_poll_at:" + env]
                       2. brokerProvider.getActivities({ type: 'OPASN', since: lastPoll })
                       3. For each activity:
                            a. Parse OCC symbol → { ticker, expiration, type, strike }
                            b. Find matching CSP_OPEN leg via legs.option_symbol = activity.symbol
                            c. If match: INSERT OR IGNORE INTO pending_assignments
                            d. If no match: DEBUG log, skip
                       4. Update app_settings["assignments_last_poll_at:" + env] = now()
                       5. Return { detected: N, skipped: M }
```

Confirmation flow:

```
IPC "assignments:confirm" → handler:
   1. Lookup pending_assignments row by id, assert status='pending'
   2. Call assignCspPosition(db, positionId, { assignmentDate: transaction_time })
   3. UPDATE pending_assignments SET status='confirmed', confirmed_at=now()
   4. Return new position state for renderer cache invalidation
```

Dismissal:

```
IPC "assignments:dismiss" → handler:
   UPDATE pending_assignments SET status='dismissed', dismissed_at=now() WHERE id=?
```

---

## Renderer Types

```typescript
export type AssignmentNotification = {
  id: number
  ticker: string
  strike: string
  expiration: string
  contractType: 'put' | 'call'
  transactionTime: string
  positionId: number
}

// TanStack Query
useQuery({
  queryKey: ['assignments', 'pending'],
  queryFn: () => window.api.assignments.listPending(),
  refetchInterval: 30_000
})
```
