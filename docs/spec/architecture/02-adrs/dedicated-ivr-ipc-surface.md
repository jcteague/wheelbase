# ADR: Manual IVR collection uses a dedicated `ivr:*` IPC surface

<!-- generated:from us-44 -->

## Decision

The manual trigger lives on a dedicated IVR IPC surface: `src/main/ipc/ivr.ts`, `window.api.ivr.collectNow()`, `src/renderer/src/api/ivr.ts`, and `useCollectIvrNow()`.

## Why

Existing feature areas use dedicated namespaces such as `assignments:*`, `settings:*`, and `market-data:*` rather than overloading unrelated handlers. A separate `ivr:*` namespace keeps `src/main/ipc/settings.ts` thin while still allowing the Settings page to host the action.

This also preserves the project's typed preload/API layering: the renderer calls an IVR-specific adapter, not a generic settings mutation that secretly runs a scheduler job.

## Alternatives considered

- **Add `ivr:collect-now` logic inside `src/main/ipc/settings.ts`** — rejected because it blurs feature boundaries and grows a handler file that should stay thin.
- **Call the scheduler from the renderer without a dedicated adapter** — rejected because it would cut across the established typed preload/API pattern.

## Source

- `plans/us-44/research.md`
- `plans/us-44/contracts/ivr-collect-now.md`
- `src/main/ipc/ivr.ts`
- `src/preload/index.ts`
- `src/renderer/src/api/ivr.ts`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
