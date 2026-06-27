---
page: docs/spec/architecture/02-adrs/renderer-snake-case-adapter.md
audited_at: 2026-06-27
findings: 0
---

# Audit: renderer-snake-case-adapter.md

## Verified (3)

- ✓ `IPC_TO_FORM_FIELD` lookup table exists in `src/renderer/src/api/positions.ts:83`.
- ✓ `mapIpcErrors(errors)` maps IPC camelCase field names back to snake_case via `IPC_TO_FORM_FIELD[e.field] ?? e.field` (`src/renderer/src/api/positions.ts:94-96`) and is applied across mutation paths (`:103,265,276,287,334,577`).
- ✓ Renderer adapter lives in `src/renderer/src/api/positions.ts` and translates per operation before calling `window.api.*`.

## Drift (0)

## Unverifiable (2)

- ? Consequences claim "`handleIpcCall` ... extracted to remove duplication." `handleIpcCall` is a main-process util (`src/main/ipc/utils.ts`), not present in the renderer adapter; in renderer-adapter context the extracted shared helper is `mapIpcErrors`. The pairing of `handleIpcCall` (main) with `mapIpcErrors` (renderer) as "the two main shared helpers" spans both layers — accurate but the page reads as if both live on the renderer side. Soft flag, not hard drift.
- ? "LegData ... snake_case ... duplicated typing in ~20 files" — matches known tech debt note; file count not re-verified.

## Missing files (0)
