# Contract: ivr:collect-now (amended)

## Purpose

Manually run the `ivr-collect` job through the scheduler as an **explicit** run, which is never
refused by the exchange calendar, and return the batch summary.

## Request

```typescript
// none — the channel takes no payload
```

## Response (success)

```typescript
{
  ok: true,
  batch: {
    successCount: number       // rows persisted (after same-session overwrite)
    errorCount: number         // tickers whose fetch failed or threw
    skippedCount: number       // tickers Barchart does not cover (not_available)
    skippedReason: null        // an explicit run is never skipped by the calendar; the field
                               // stays in CollectIvrNowBatchSchema because the scheduled path
                               // shares the summary type
  }
}
```

## Error codes

| field      | code             | message                                                  |
| ---------- | ---------------- | -------------------------------------------------------- |
| `__root__` | `internal_error` | `IVR collection failed before producing a batch summary` |
| `__root__` | `internal_error` | `An unexpected error occurred`                           |

## Behaviour change (US-100)

- The handler code is unchanged. `scheduler.runNow(IVR_COLLECT_JOB_NAME)` now passes
  `{ trigger: 'explicit' }` to the job handler, which forwards it to `collectIVRSnapshots`.
- On a weekend or a recognised weekday holiday the run **collects** and stamps each reading at
  the close of the most recent completed session (e.g. Friday's `closeAt` on a Sunday).
- If a scheduled run is already in flight, `runNow` joins it and returns its summary (unchanged
  scheduler behaviour). A scheduled run can only be in flight on a session day, so a joined manual
  refresh never reports `market_closed`.
- The Settings page branch that rendered a "market closed" message for `skippedReason ===
'market_closed'` becomes unreachable from this channel and is removed (see plan Refactor).

## Source

- Handler: `src/main/ipc/ivr.ts`
- Scheduler: `src/main/services/polling-scheduler.ts` (`runNow`, `JobRunContext`)
- Job registration: `src/main/index.ts` (`ivr-collect` handler forwards `ctx.trigger`)
- Service: `src/main/services/ivr-collector.ts` (`collectIVRSnapshots({ trigger })`)
