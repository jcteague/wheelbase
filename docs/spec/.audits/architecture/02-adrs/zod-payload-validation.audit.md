---
page: docs/spec/architecture/02-adrs/zod-payload-validation.md
audited_at: 2026-06-27
findings: 0
---

# Audit: zod-payload-validation.md

All schemas in `src/main/schemas.ts`.

## Verified (12)

- ✓ `CloseCspPayloadSchema` — `schemas.ts:103`
- ✓ `ExpireCspPayloadSchema` — `schemas.ts:160`
- ✓ `AssignCspPayloadSchema` — `schemas.ts:183`
- ✓ `OpenCcPayloadSchema` — `schemas.ts:207`
- ✓ `CloseCcPayloadSchema` — `schemas.ts:278`
- ✓ `ExpireCcPayloadSchema` — `schemas.ts:254`
- ✓ `RollCspPayloadSchema` — `schemas.ts:322` (extends `RollPayloadBaseSchema`)
- ✓ `GetStockQuotesPayloadSchema` — `schemas.ts:363`
- ✓ `SetStockQuoteTickersPayloadSchema` — `schemas.ts:368`
- ✓ Shared `PositionIdSchema = z.string().uuid()` reused across handlers — `schemas.ts:16`, referenced at `:104` and elsewhere. (Page describes it as exported; in code it is module-local `const`, not `export const` — see note below.)
- ✓ Money field validated with `z.number().positive()` — `schemas.ts:105,280` (`closePricePerContract: z.number().positive()`), matching the example.
- ✓ `RollCspPayloadSchema.newExpiration` uses an ISO-date regex — `schemas.ts:306` (`z.string().regex(IsoDateRegex, IsoDateMessage)`), matching the "re-tightened to `/^\d{4}-\d{2}-\d{2}$/`" claim (regex centralized as `IsoDateRegex`).

## Drift (0)

None material. Minor wording note: the page says `PositionIdSchema` is "shared" and reused (true), but it is declared `const PositionIdSchema` (module-local), not exported. Not a drift in behavior.

## Unverifiable (2)

- ? "Zod failures are mapped into the IPC errors[] array using the issue's path as field and code as code" — handler/`handleIpcCall` error-mapping behavior; not verified in this schema-focused audit (would require auditing `src/main/ipc/utils.ts`).
- ? "The renderer adapter coerces strings to numbers before calling window.api.\*" — renderer-adapter narrative; flag for human review.

## Missing files (0)

None within src/ scope.
