# Contract: dev-only test channels (new, `NODE_ENV === 'test'` only)

## `_test:ivr-fetch-log`

### Purpose

Return every ticker the fake scraper has been asked for since outcomes were last programmed, so
negative ACs ("no IVR request is made for KO") are assertable.

### Request

```typescript
// none
```

### Response (success)

```typescript
string[]   // upper-cased tickers in call order, e.g. ['AAPL']
```

Reset to `[]` by `_test:ivr-set-outcomes`.

### Error codes

| field | code | message                       |
| ----- | ---- | ----------------------------- |
| —     | —    | Raw dev channel, no envelope. |

### Source

- `src/main/ipc/test-ivr.ts`, `src/main/integrations/fake-ivr.ts` (`fetchLog`, `readFakeIvrFetchLog`)
- Preload: `testIvrFetchLog`; e2e: `readIvrFetchLog(page)` in `e2e/ivr-helpers.ts`

## `_test:scheduler-run-scheduled`

### Purpose

Run a registered job as if the timer had fired (`trigger: 'scheduled'`) and return the handler's
result, so the scheduled guard can be asserted end to end.

### Request

```typescript
jobName: string // e.g. 'ivr-collect'
```

### Response (success)

```typescript
unknown // the handler's return value; for ivr-collect the CollectIVRSnapshotsResult
```

Throws `SchedulerError('job_not_found')` for an unknown job (raw dev channel).

### Error codes

| field | code | message                       |
| ----- | ---- | ----------------------------- |
| —     | —    | Raw dev channel, no envelope. |

### Source

- `src/main/ipc/test-scheduler.ts` → `scheduler.runNow(jobName, { trigger: 'scheduled' })`
- Preload: `testSchedulerRunScheduled`; e2e: `collectIvrScheduled(page): Promise<IvrBatch>` in `e2e/ivr-helpers.ts`
