# ADR: React Hook Form + Zod resolver for renderer forms

<!-- generated:from us-4, us-12, us-12-refactor, missing-ac -->

## Decision

Every renderer form uses `useForm` from `react-hook-form` with `zodResolver(schema)` as the resolver. The Zod schema is defined inline in the component (or in a `makeXSchema(...)` factory when validation depends on dynamic context like the current expiration date). Form field names use snake_case (matching the renderer's payload convention — see ADR [renderer-snake-case-adapter](./renderer-snake-case-adapter.md)); the resolver schema fields use string types because form inputs are strings, with `.refine(v => parseFloat(v) > 0, ...)` for numeric validation. The adapter parses strings to numbers when constructing the IPC payload.

This is mandatory for new forms — no hand-managed `useState` form state, no imperative `validate()` functions. `RollCspSheet` was migrated from hand-managed state to RHF+Zod during `us-12-refactor` to bring it into line.

## Context / Why

- The codebase already standardised on RHF+Zod for `NewWheelForm`, `CloseCspForm`, and others. Mixing patterns adds cognitive load.
- Hand-managed state has known NaN edge cases on numeric inputs and duplicates validation that the schema can express declaratively.
- The `.refine()` pattern lets the schema validate dynamic constraints (`new_expiration > current_expiration`) using a factory that receives the current value as a closure.
- CLAUDE.md's renderer rule: "All renderer forms **must** use React Hook Form + Zod resolver — no hand-managed `useState` form state."

## Alternatives considered

- **Hand-managed `useState` per field + imperative `validate()`** — explored in early `RollCspSheet` and later replaced; doesn't reduce boilerplate and loses error-clearing-on-change.
- **Reuse the main-process IPC schema directly in the renderer** — rejected; renderer needs string-typed inputs while the IPC schema expects numbers. A renderer-side Zod schema with `.refine()` + parse-on-submit is the established pattern.
- **Formik / other form libs** — rejected; RHF is already in the codebase, minimal re-render performance is good, and the Zod resolver is officially supported.

## Consequences

- New forms get one Zod schema, one `useForm({ resolver: zodResolver(schema) })` call, `register` or `Controller` per input, and `handleSubmit` on the form.
- Dynamic validation (date ordering, contracts ≤ shares-held) uses a `makeXSchema(...)` factory pattern, mirroring `CloseCspForm`'s `makeCloseCspSchema(...)`.
- Reactive derived values (P&L preview, guardrail message) use `useWatch` to subscribe to specific fields without forcing the whole form to re-render.
- Submit handler converts string form values to the typed payload required by the renderer adapter, then calls `mutate(...)` from the corresponding TanStack Query hook.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — RHF + Zod resolver with `close_price_per_contract: z.coerce.number().positive(...)`, `fill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()`
- [extract: us-12](../../.extracts/us-12.md) — ADR "React Hook Form + Zod resolver for the sheet form"
- [extract: us-12-refactor](../../.extracts/us-12-refactor.md) — ADR "RHF + Zod Migration for RollCspSheet"
- [extract: missing-ac](../../.extracts/missing-ac.md) — `closeCspSchema` Zod schema additions for `fill_date`
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-12-roll-csp](../../features/us-12-roll-csp.md)
<!-- /generated -->
