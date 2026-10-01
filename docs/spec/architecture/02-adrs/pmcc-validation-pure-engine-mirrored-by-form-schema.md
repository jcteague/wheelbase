# ADR: PMCC entry validation is a pure `openPmcc` engine, mirrored by the form schema

<!-- generated:from us-101 -->

## Decision

`openPmcc(input)` in `src/main/core/lifecycle.ts` owns every PMCC entry rule. It throws `ValidationError(field, code, message)` with the AC's exact messages and returns `{ phase: 'PMCC_OPEN' }` on success.

**Field paths.** Field paths are dotted: `long.fillPrice`, `short.expiration`, `short.strike`, and so on. Pair-level errors use `__pair__`. The `PmccField` type (`` 'ticker' | '__pair__' | `${'long' | 'short'}.${keyof OpenPmccLegInput}` ``) constrains every path.

**Mirror schema.** The renderer's `pmccEntrySchema` (`src/renderer/src/schemas/pmcc-entry.ts`) enforces the field-shape rules with the same messages and the cross-leg rules through `superRefine`. Its paths are pinned with `as const satisfies readonly PmccField[]`, so the two sides cannot name different fields. `__pair__` is a typed optional key of the entry schema. Server pair-level errors land in the same typed slot as client ones, which removed two casts.

**Rule order.** The unexpired-contract rule runs **before** the expiration-after-fill-date rule, in both the engine and the schema. That way, an already-expired contract entered with today's fill date gets the AC's "Use an unexpired contract…" message.

**Boundary-only rules.** Four rules have no form field: underlying mismatch, not a call, quantity mismatch, and non-standard deliverable. The form always sends `ticker`, `'CALL'`, the shared `contracts`, and `100`. These rules are covered by engine tests and by e2e calls that go straight to `window.api.createPmccPosition`.

**Envelope change.** `handleIpcCall` now builds a Zod issue's `field` with `issue.path.join('.')`, falling back to `__root__`, where it used to take `path[0]`. The change is backward-compatible for every single-segment path, and `ValidationError` dotted fields pass through unchanged.

## Context / Why

- Engines are pure and own the rules ([pure-core-engines](./pure-core-engines.md)). The story says to "use the same validation at the main-process boundary".
- Dotted paths map one-to-one onto React Hook Form's nested `setError('long.fillPrice')`, so server errors land on the right input with no translation table.

## Alternatives considered

- **A flat payload (`longStrike`, `shortStrike`, …).** Rejected: it loses the named legs and would make US-104 / US-105 inconsistent.
- **Zod-only validation.** Rejected: Zod cannot express the custom error codes.

## Consequences

- Numeric bounds are deliberately **not** in the IPC Zod schema; the engine owns those messages. Zod only checks shape, plus the two per-leg "Enter the actual … fill price." messages for missing fills.
- Property tests check that generated valid input is accepted, that the strike, expiration, net-debit and put guards fire, and that every thrown `field` is a member of `PmccField`.
- Extends [error-field-naming-convention](./error-field-naming-convention.md) with dotted paths and `__pair__`, and [zod-payload-validation](./zod-payload-validation.md) with the shared `IsoDateSchema`.
- The helper `requireNonNegativeDecimal` was renamed `requireNonNegativeFees`. The wheel's `openWheel` / `openCoveredCall` were deliberately not switched to the per-leg helpers because their messages differ.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
