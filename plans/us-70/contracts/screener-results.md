# Contract: `screener:results` (US-70 amendment)

US-70 adds **no new IPC channel**. It changes one field on the existing
`screener:results` success payload, shipped by US-65. This file records only the
delta; the base contract is `plans/us-65/contracts/screener-results.md`.

## Purpose

Return the ranked screener candidates, each now carrying an explicit earnings
verdict rather than an opaque boolean flag.

## Request

Unchanged — no payload.

```typescript
// No Zod request schema; nothing to validate.
window.api.screener.results(): Promise<IpcResult<ScreenerResults>>
```

## Response (success)

Unchanged except for the `earnings` field on each ranked candidate.

```typescript
type IpcCandidateEarnings =
  | { status: 'clear' }
  | { status: 'flagged'; date: string; daysBeforeExpiry: number }
  | { status: 'unknown' }
  | { status: 'unavailable' }

type IpcScoredCandidate = {
  // …all US-65 fields unchanged…
  earnings: IpcCandidateEarnings // REPLACES `earningsFlagged: boolean`
}

type ScreenerResults = {
  status: 'ok' | 'provider_unavailable'
  ranked: IpcScoredCandidate[] // rank order — earnings tier, then yield-per-delta
  excluded: IpcScreenerExclusion[]
  quoteTimestamp: string | null
}
```

**Breaking change.** `earningsFlagged` is removed, not deprecated alongside the new
field. It has exactly one reader (`src/renderer/src/api/screener.ts:34`, which
never renders it), so carrying both would leave dead surface behind.

`ranked` order is authoritative — the renderer must not re-sort. Rank numbers are
still positional, but only `clear` candidates display one; demoted rows render `—`.

### Ordering guarantee

1. earnings tier ascending — `clear` (0), then `unknown`/`unavailable` (1), then
   `flagged` (2)
2. `yieldPerDelta` descending within a tier
3. `ticker` ascending as the final tie-break

`flagged` can only appear when the persisted criteria set
`earningsHandling: 'flag'`. Under `exclude` an in-window candidate appears in
`excluded` with code `earnings_in_window` instead.

## Error codes

No story-specific validation errors. Every expected failure is modelled inside the
success payload — an earnings-feed outage surfaces as
`earnings: { status: 'unavailable' }` per candidate, never as an envelope error and
never as `status: 'provider_unavailable'` (which remains reserved for a Massive
chain outage). Only the standard envelope errors apply:

| field      | code             | message                  |
| ---------- | ---------------- | ------------------------ |
| `__root__` | `internal_error` | (unexpected errors only) |

## Source

- Handler: `src/main/ipc/screener.ts` (unchanged — the handler stays a thin
  `handleIpcCall` wrapper over one service call)
- Service: `src/main/services/screener.ts`
- Engine: `src/main/core/screener.ts`
- Feed: `src/main/integrations/finnhub-earnings.ts`
- Preload types: `src/preload/index.d.ts`
