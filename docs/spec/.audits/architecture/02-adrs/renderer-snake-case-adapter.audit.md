---
page: docs/spec/architecture/02-adrs/renderer-snake-case-adapter.md
audited_at: 2026-09-28
findings: 1
---

# Audit: renderer-snake-case-adapter.md

## Verified (5)

- ✓ Renderer payload types use snake_case (`position_id`, `close_price_per_contract`, `fill_date`, `expiration_date_override`) — `src/renderer/src/api/positions.ts:28, 167-168, 194-195`.
- ✓ Adapters translate to camelCase before calling `window.api.*` (e.g. `positionId: payload.position_id`, `closePricePerContract: …`, `expirationDateOverride: …`) — `api/positions.ts:253-254, 265-266, 276`.
- ✓ `IPC_TO_FORM_FIELD` table (incl. `closePricePerContract`, `fillDate`, `costToClosePerContract`, `newPremiumPerContract`) and `mapIpcErrors(errors)` — `api/positions.ts:78-93`.
- ✓ Adapters cast `result as unknown as <Response>` — `api/positions.ts:248, 260, 271, 282`.
- ✓ `handleIpcCall` exists as the shared main-side envelope helper — `src/main/ipc/utils.ts` (referenced from `src/renderer/src/api/error.ts:13`).

## Drift (1)

- ✗ Line 26: the snake_case `LegData` type "produc[es] duplicated typing and unsafe casts in ~20 files". `LegData` is referenced only inside `src/renderer/src/api/positions.ts` (`:40, 57, 189, 200, 220`; zero references elsewhere in `src/renderer/src`), and `as unknown as` casts appear only in that file. `LegData` itself is now mixed-case (`instrumentType`, `premium_per_contract` — `api/positions.ts:40-47`). Suggested fix: update the tech-debt description to its current extent.

## Unverifiable (2)

- ? Line 7 / 13 "The renderer uses snake_case for form field names" — the convention holds for the position-mutation adapters but several forms use camelCase (see `react-hook-form-zod` audit); treated as scoped to these adapters.
- ? FastAPI-era convention history — history.

## Missing files (0)

None.
