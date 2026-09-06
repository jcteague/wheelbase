# ADR: Per-ticker failure isolation in the IVR collection loop

<!-- generated:from us-97 -->

## Decision

Each ticker's **fetch** in `collectIVRSnapshots` is wrapped in `try/catch`. A thrown fetch
failure counts as `errorCount`, logs a WARN under the `err` key with the message
`IVR collection threw for ticker`, and the loop continues to the next ticker.

Two failure classes are deliberately NOT isolated per ticker:

- **`persistSnapshot` stays outside the `try`.** A DB write failing is systemic — a read-only
  file, a locked database, a bad migration — not a property of one ticker. Isolating it would
  downgrade a broken run to N per-ticker WARNs and report it to the trader as a muted
  "completed with N errors". A persist throw aborts the run as a run-level failure; the
  scheduler logs it, and the manual path surfaces an error envelope.
- **`getMarketStatus` degrades instead of rejecting.** The broker clock read at the top of the
  run is boundary I/O: if the broker is unreachable — or no broker is configured at all
  (`brokerProvider: null`) — the run logs and assumes a trading day rather than aborting.
  Barchart needs no broker, so a watchlist-only trader with no Alpaca credentials still gets
  collection.

Request pacing is the scraper's job alone: `fetchIVR` awaits its internal 1 req/s rate limiter
before every Barchart call, so the collection loop adds no sleep of its own. (An earlier
version slept 1 second between tickers _on top of_ that limiter, making per-ticker cost
`1000ms + latency` instead of `max(1000ms, latency)` — pure waste once US-97 multiplied the
batch size by the watchlist.)

The loop also checks an optional `AbortSignal` at each ticker boundary. The app's before-quit
hook aborts it, because a watchlist-sized batch cannot drain inside `scheduler.stop()`'s
5-second timeout.

## Why

CLAUDE.md's batch-job rule requires per-item isolation — see
[Alert evaluation failure isolation](./alert-evaluation-failure-isolation.md), the incident that
motivated it. The IVR collection loop had none: it handled every _returned_ `IVRResult` status
but nothing that _threw_.

That gap was reachable. `fetchIVR` parses the response body outside a `try`
(`src/main/integrations/barchart-ivr-scraper.ts`), so a 200 response with a non-JSON body — an
interstitial, a captcha page, an HTML error — rejects rather than returning a `network_error`.

The consequence was worse than a lost ticker. `PollingScheduler.runHandler` catches a rejected
handler, logs one WARN, and returns `undefined`, so the nightly after-close run collected nothing
past the first bad ticker. On the manual path, the IPC layer used to feed that `undefined`
straight into `CollectIvrNowBatchSchema.parse`, and the trader saw a confusing Zod type error;
it now converts it to an explicit run-level failure message first.

## Why it surfaced with US-97

The gap is pre-existing from US-44, but
[widening the targets to the watchlist](./union-ivr-targets-positions-and-watchlist.md) is what
makes it likely to bite. The batch moves from "names the trader holds" to arbitrary speculative
bench names, which are far likelier to be uncovered — and so likelier to provoke exactly the odd,
non-JSON responses that reject.

## Logging detail

The caught fetch failure is logged as `err`, the key pino's Error serializer is bound to by
default. Other main-process sites (e.g. `evaluate-alerts.ts`) log caught exceptions under
`error`, so `src/main/logger.ts` also configures `serializers: { error: pino.stdSerializers.err }`
— without a configured serializer, a thrown `Error` under a non-`err` key stringifies to `{}`,
because `message` and `stack` are non-enumerable. Non-Error values (like the scraper's returned
`error` objects) pass through the serializer unchanged.

The two branches log distinct messages — `IVR collection failed for ticker` for a returned error
status, `IVR collection threw for ticker` for an exception — because a vendor error the scraper
classified and a broken scraper contract are operationally different.

## Source

- `src/main/services/ivr-collector.ts`
- `src/main/services/polling-scheduler.ts` — `runHandler`
- `src/main/integrations/barchart-ivr-scraper.ts`
- `src/main/logger.ts`
- Feature page: `../../features/us-97-collect-ivr-for-watchlist-underlyings.md`
<!-- /generated -->
