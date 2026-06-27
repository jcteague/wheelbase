---
page: docs/spec/architecture/02-adrs/dedicated-ivr-ipc-surface.md
audited_at: 2026-06-27
findings: 0
---

# Audit: dedicated-ivr-ipc-surface.md

## Verified (5)

- ✓ `src/main/ipc/ivr.ts` exists.
- ✓ `src/renderer/src/api/ivr.ts` exists and calls `window.api.ivr.collectNow()`: `src/renderer/src/api/ivr.ts:13`.
- ✓ `window.api.ivr.collectNow` is wired in the preload: `src/preload/index.ts:71-72` (`ivr: { collectNow: () => invoke('ivr:collect-now') }`).
- ✓ `useCollectIvrNow()` hook exists: `src/renderer/src/hooks/useCollectIvrNow.ts:4`, consumed by `SettingsPage.tsx:16,358`.
- ✓ Dedicated `ivr:*` channel (`ivr:collect-now`) rather than overloading `settings:*`.

## Drift (0)

None.

## Unverifiable (0)

The "keeps settings.ts thin / preserves typed preload layering" reasoning is design rationale, but its concrete claims are all verified above.

## Missing files (0)

- ✓ Feature page `../../features/us-44-ivr-snapshot-store-and-scheduler.md` exists. (`plans/us-44/...` references are outside audit scope.)
