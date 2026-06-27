---
page: docs/spec/architecture/02-adrs/option-snapshots-rest-polling.md
audited_at: 2026-06-27
findings: 0
---

# Audit: option-snapshots-rest-polling.md

## Verified (5)

- ✓ `useOptionSnapshots(legs, { session })` exists and accepts a `session` option (`'regular'|'pre'|'post'|'closed'`) — `src/renderer/src/hooks/useOptionSnapshots.ts:19`.
- ✓ `refetchInterval: session === 'closed' ? false : 60_000` — `useOptionSnapshots.ts:22,64` (`POLL_INTERVAL_MS = 60_000`).
- ✓ `staleTime: 30_000` — `useOptionSnapshots.ts:23,65` (`STALE_TIME_MS = 30_000`).
- ✓ `refetchOnWindowFocus: true` and `enabled: symbols.length > 0` — `useOptionSnapshots.ts:63,66`.
- ✓ No streaming bridge for options — the hook is a plain TanStack Query poll; stream merge logic exists only for stock quotes (`useStockQuotes.ts`).

## Drift (0)

(none)

## Unverifiable (1)

- ? "Alpaca's option-snapshot REST endpoint returns Greeks; the option-quote streaming feed does not" — Alpaca rationale; provider is now Massive. Narrative, not falsifiable by grep, but the polling-only design is fully verified above.
