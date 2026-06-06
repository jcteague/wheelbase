# ADR: Renderer snake_case payloads, IPC camelCase boundary
<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12, missing-ac -->

## Decision

The renderer uses snake_case for form field names and payload types (`position_id`, `close_price_per_contract`, `fill_date`, `cost_to_close_per_contract`, `new_premium_per_contract`, `expiration_date_override`). The IPC layer uses camelCase (`positionId`, `closePricePerContract`, `fillDate`, etc.). A single adapter function per operation in `src/renderer/src/api/positions.ts` translates between the two before calling `window.api.*`.

A shared `IPC_TO_FORM_FIELD` lookup table in the same file maps IPC camelCase field names back to renderer snake_case names so that server-side validation errors (`{ field: 'fillDate', code: 'close_date_before_open' }`) can be routed onto the correct form input by `mapIpcErrors(errors)`.

## Context / Why

- React Hook Form + the project's existing form conventions use snake_case field names (matches FastAPI-era convention preserved from the pre-Electron codebase).
- TypeScript convention on the main process is camelCase, and SQLite columns in the schema are snake_case but the Zod-inferred IPC types are camelCase.
- Having a single boundary translation per operation localises the case conversion and keeps the renderer free of camelCase quirks.

## Alternatives considered

- **Use camelCase throughout the renderer** — rejected; would require a sweep of every existing form and the renderer's `LegData` type (which is snake_case for legacy reasons).
- **Use snake_case all the way through the main process** — rejected; conflicts with TypeScript convention and the Zod schema naming used by `z.infer<typeof Schema>`.
- **Auto-translate at the preload layer** — rejected; preload should remain a thin pass-through; complex translation belongs in the renderer adapter where the snake_case form contracts are also defined.

## Consequences

- Every new mutation operation extends `IPC_TO_FORM_FIELD` with its new camelCase ↔ snake_case mappings.
- The `LegData` type in the renderer is snake_case while IPC returns camelCase legs, producing duplicated typing and unsafe casts in ~20 files — flagged as project-level tech debt (`feedback_legdata_snake_case_debt`). Future cleanup may align both sides; for now adapters explicitly cast `result as unknown as Response`.
- Refactor-phase extraction: `mapIpcErrors(errors)` and `handleIpcCall` were the two main shared helpers extracted to remove duplication across mutation paths.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — Renderer API adapter snake_case ↔ camelCase mapping
- [extract: us-5](../../.extracts/us-5.md) — `expirePosition` adapter mapping
- [extract: us-6](../../.extracts/us-6.md) — `assignPosition` adapter mapping, `IPC_TO_FORM_FIELD` addition
- [extract: us-7](../../.extracts/us-7.md) — Renderer API adapter mapping for `openCoveredCall`
- [extract: us-8](../../.extracts/us-8.md) — `closeCoveredCallEarly` adapter mapping
- [extract: us-9](../../.extracts/us-9.md) — `expireCc` adapter mapping
- [extract: us-12](../../.extracts/us-12.md) — Renderer API adapter `rollCsp` snake_case payload
- [extract: missing-ac](../../.extracts/missing-ac.md) — `fillDate` error mapping
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
