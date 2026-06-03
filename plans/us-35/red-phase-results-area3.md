# Red Phase Results: detect-assignments Service (Area 3)

## Feature Context

- **Feature directory**: `plans/us-35/`
- **Plan file**: `plans/us-35/plan.md`
- **Data model**: `plans/us-35/data-model.md`

## Test Files Created

- `src/main/services/detect-assignments.test.ts` — 11 test cases covering all detection logic

## Interfaces Under Test

```typescript
// src/main/services/detect-assignments.ts
export async function detectAssignments(args: {
  db: Database.Database
  brokerProvider: BrokerProvider
  env: 'paper' | 'live'
  logger: { info: Fn; debug: Fn; warn: Fn; error: Fn }
}): Promise<{ detected: number; skipped: number; brokerError?: BrokerError }>

// src/main/services/app-settings.ts (implicit dependency)
export const appSettings: {
  get(db: Database.Database, key: string): string | undefined
  set(db: Database.Database, key: string, value: string): void
}
```

## Test Coverage Summary

- [x] Watermark defaults to 24h ago when no app_settings entry exists
- [x] Uses stored watermark from app_settings when available
- [x] Calls getActivities with type: 'OPASN'
- [x] Creates pending_assignments row on matching activity
- [x] Logs INFO "Assignment detected" with ticker on match
- [x] Skips activity with no matching CSP leg, logs DEBUG
- [x] Duplicate activity_id is a no-op (INSERT OR IGNORE)
- [x] Multiple OPASN events create multiple rows
- [x] Watermark updated to ~now after successful batch (even with skips)
- [x] BrokerError(network_error) → WARN log, no rows, no watermark update, graceful return
- [x] BrokerError(auth_failed) → typed result with brokerError.code

## Test Execution Results

```
FAIL src/main/services/detect-assignments.test.ts
Error: Cannot find module './detect-assignments'
```

## Verification

- ✅ Every test fails because `./detect-assignments` module does not exist
- ✅ No syntax errors in test file
- ✅ No fixture or import errors
