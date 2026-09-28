---
page: docs/spec/architecture/02-adrs/dedicated-ivr-ipc-surface.md
audited_at: 2026-09-28
findings: 0
---

# Audit: docs/spec/architecture/02-adrs/dedicated-ivr-ipc-surface.md

## Verified (6)

- ✓ `src/main/ipc/ivr.ts` registers `ivr:collect-now` through `handleIpcCall`, running `scheduler.runNow(IVR_COLLECT_JOB_NAME)` — `src/main/ipc/ivr.ts:7-20`.
- ✓ `window.api.ivr.collectNow()` — `src/preload/index.ts:86-87`.
- ✓ Renderer adapter `src/renderer/src/api/ivr.ts` exists.
- ✓ `useCollectIvrNow()` hook — `src/renderer/src/hooks/useCollectIvrNow.ts:4`, used by `src/renderer/src/pages/SettingsPage.tsx:17,484`.
- ✓ `src/main/ipc/settings.ts` contains no IVR logic (no `ivr` matches).
- ✓ Surface survived Barchart retirement unchanged (the `ivr:*` names were kept deliberately — see `barchart-retired-from-code-and-schema.md:11-12`).

## Drift (0)

## Unverifiable (1)

- ? "Keeps `src/main/ipc/settings.ts` thin" / layering rationale — narrative.

## Missing files (0)

- (none) — `plans/us-44/research.md`, `plans/us-44/contracts/ivr-collect-now.md`, the three source files, and `../../features/us-44-ivr-snapshot-store-and-scheduler.md` exist.
