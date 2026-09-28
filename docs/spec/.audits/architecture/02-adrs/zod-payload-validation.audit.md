---
page: docs/spec/architecture/02-adrs/zod-payload-validation.md
audited_at: 2026-09-28
findings: 2
---

# Audit: zod-payload-validation.md

## Verified (7)

- ✓ Schemas live in `src/main/schemas.ts` with inferred types exported alongside — e.g. `CloseCspPayloadSchema` / `CloseCspPayload` at `schemas.ts:129-135`.
- ✓ All named schemas exist: `CloseCspPayloadSchema` (129), `ExpireCspPayloadSchema` (186), `AssignCspPayloadSchema` (209), `OpenCcPayloadSchema` (233), `ExpireCcPayloadSchema` (280), `CloseCcPayloadSchema` (304), `RollCspPayloadSchema` (348), `GetStockQuotesPayloadSchema` (389), `SetStockQuoteTickersPayloadSchema` (394).
- ✓ Zod failures map to `errors[]` with `field = issue.path[0]` and `code = issue.code` — `src/main/ipc/utils.ts:53-61`.
- ✓ `PositionIdSchema = z.string().uuid()` shared across position schemas — `schemas.ts:40`.
- ✓ `closePricePerContract: z.number().positive()` — `schemas.ts:131`; ISO date regex `/^\d{4}-\d{2}-\d{2}$/` — `schemas.ts:42`.
- ✓ `RollCspPayloadSchema.newExpiration` uses the regex — via `RollPayloadBaseSchema`, `schemas.ts:328-332,348`.
- ✓ Renderer forms use `zodResolver` — e.g. `src/renderer/src/components/NewWheelForm.tsx:1,87`; linked ADR `./react-hook-form-zod.md` and all extract/feature links exist.

## Drift (1)

- ✗ Page says "Every IPC handler that takes a payload validates it with a Zod schema … before invoking the service" (line 7). `positions:create` passes a TS-typed `CreatePositionPayload` straight to `createPosition` with no `.parse` (`src/main/ipc/positions.ts:56-60`), and `CreatePositionPayloadSchema` (`schemas.ts:45`) is never used for parsing (grep finds only its definition and `z.infer`). `positions:get` also reads `payload.positionId` unvalidated and builds its envelope by hand outside `handleIpcCall` (`positions.ts:62-71`). Suggested fix: parse both payloads, or scope the claim.

## Unverifiable (1)

- ? "The renderer adapter coerces strings to numbers before calling `window.api.*`" and the post-review tightening history — not exhaustively audited.

## Missing files (0)

None.
