# ADR: Zod payload validation at the IPC boundary

<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12, us-32 -->

## Decision

Every IPC handler that takes a payload validates it with a Zod schema defined in `src/main/schemas.ts` before invoking the service. The schema is the single source of truth for the payload shape; the inferred type (`z.infer<typeof Schema>`) is exported alongside. Zod failures are mapped into the IPC `errors[]` array using the issue's `path` as the `field` and `code` as the `code`.

Examples: `CloseCspPayloadSchema`, `ExpireCspPayloadSchema`, `AssignCspPayloadSchema`, `OpenCcPayloadSchema`, `CloseCcPayloadSchema`, `ExpireCcPayloadSchema`, `RollCspPayloadSchema`, `GetStockQuotesPayloadSchema`, `SetStockQuoteTickersPayloadSchema`.

Renderer-side forms additionally use Zod schemas wired through `react-hook-form`'s `zodResolver` for client-side validation (see ADR [react-hook-form-zod](./react-hook-form-zod.md)).

## Context / Why

- The renderer sends raw `unknown` payloads through `ipcRenderer.invoke`. Without parsing, the handler would have to type-assert and trust the client — exactly the same trust problem an HTTP API has with `request.body`.
- Zod gives one declarative schema that produces (a) runtime validation, (b) a TypeScript type, and (c) a structured error array suitable for the IPC envelope.
- Money fields (`closePricePerContract: z.number().positive()`) and dates (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`) are validated at the boundary so engines downstream can assume the inputs are already shape-correct.
- The pattern works for non-payload schemas too: shared `PositionIdSchema = z.string().uuid()` is reused across all position-mutation handlers.

## Alternatives considered

- **Hand-written type guards** — rejected; verbose, error-prone, and not introspectable.
- **TypeScript-only contracts** — rejected; types disappear at runtime; the IPC boundary is exactly where runtime checking earns its keep.
- **Validate only at the service layer** — rejected; pushes IPC-shape concerns into business logic.

## Consequences

- Adding a new IPC handler requires a new schema in `src/main/schemas.ts` even when the payload is trivial (one UUID). Consistency outweighs brevity here.
- Date strings are tightened to a regex when they were initially loose; `RollCspPayloadSchema.newExpiration` was re-tightened from `z.string()` to `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)` during post-review fixes.
- Renderer-side forms keep string-typed Zod schemas (form inputs are strings) and `.refine()` to parse-and-validate numerics, while the main-process schema uses `z.number().positive()` directly. The renderer adapter coerces strings to numbers before calling `window.api.*`.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — `CloseCspPayloadSchema`
- [extract: us-5](../../.extracts/us-5.md) — `ExpireCspPayloadSchema`
- [extract: us-6](../../.extracts/us-6.md) — `AssignCspPayloadSchema`
- [extract: us-7](../../.extracts/us-7.md) — `OpenCcPayloadSchema`
- [extract: us-8](../../.extracts/us-8.md) — `CloseCcPayloadSchema`
- [extract: us-9](../../.extracts/us-9.md) — `ExpireCcPayloadSchema`
- [extract: us-12](../../.extracts/us-12.md) — `RollCspPayloadSchema` (with `newExpiration` regex tightening)
- [extract: us-32](../../.extracts/us-32.md) — `GetStockQuotesPayloadSchema`, `SetStockQuoteTickersPayloadSchema`
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
