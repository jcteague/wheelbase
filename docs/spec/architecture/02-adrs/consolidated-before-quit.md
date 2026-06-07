# ADR: Single `before-quit` handler awaits both scheduler and market-data shutdown

<!-- generated:from us-35 -->

## Decision

The Electron `app.on('before-quit', ...)` handler calls `e.preventDefault()`, awaits `Promise.all([scheduler.stop(), marketDataProvider.disconnect()])`, then calls `app.exit(0)`. There is exactly one `before-quit` registration.

## Why

Before US-35 the `marketDataProvider.disconnect()` call was fire-and-forget — quit completed before the WebSocket closed cleanly. Adding the scheduler's `stop()` (which drains in-flight handler promises with a 5-second timeout) made it worth doing the shutdown deterministically: prevent the default quit, wait for both subsystems to finish, then exit.

Running the two shutdowns through `Promise.all` overlaps them — the scheduler can be draining the same poll that the market-data provider's WebSocket close interrupts.

## Alternatives considered

- **Two separate `before-quit` listeners** — Electron supports it but the implicit ordering is unclear; one handler with explicit `Promise.all` is more readable and easier to reason about.
- **Skip the `preventDefault` and rely on best-effort cleanup** — the original behaviour; produces "WebSocket aborted" warnings in logs and could leave in-flight DB transactions in inconsistent states once more handlers register.

## Source

- `plans/us-35/refactor-phase-area6-results.md`
- Feature page: `../../features/us-46-polling-scheduler.md`
- Related: `scheduler-singleton-safe-broker.md`
<!-- /generated -->
