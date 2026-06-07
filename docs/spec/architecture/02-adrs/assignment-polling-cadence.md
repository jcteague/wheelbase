# ADR: Assignment-detection cadence is 60s regular, 5min extended, parked overnight

<!-- generated:from us-35 -->

## Decision

The `detect-assignments` job uses cadence policy `{ kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000, marketClosedMs: null }`. That maps to: 60-second polls during regular market hours, 5-minute polls during pre/post extended hours, and `null` (parked — no ticks) when the market is closed. The first tick fires once on `scheduler.start()`, regardless of session.

## Why

OPASN events post overnight after expiration. The poll that matters is the **first one of the next market session**, which catches everything from the prior night. Faster cadence within the trading day is for the corner case of same-day early-exercise assignment (rare but possible on deep-ITM puts near ex-dividend).

Parking overnight (`marketClosedMs: null`) saves a no-op poll every minute for 16+ hours per weekday and the full weekend. The single `scheduler.start()` tick handles "the trader opened the app over the weekend and there's an assignment from Friday".

## Alternatives considered

- **Single tick at "market open + 30 minutes"** — research notes this as a possible tightening; deferred until user feedback shows the per-minute cadence is wasteful.
- **Always-on 60s polling** — wasteful during closed hours; the value of catching an OPASN three minutes faster on a Saturday is zero.

## Source

- `plans/us-35/research.md`
- Feature page: `../../features/us-35-assignment-detection.md`
- Related: `polling-scheduler-settimeout-chain.md`
<!-- /generated -->
