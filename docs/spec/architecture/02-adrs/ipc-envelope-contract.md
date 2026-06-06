# ADR: IPC envelope contract — `{ ok: true, ... } | { ok: false, errors: [...] }`

<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12, us-32 -->

## Decision

Every IPC handler returns one of two shapes:

```ts
{ ok: true,  ...result }
{ ok: false, errors: Array<{ field: string; code: string; message: string }> }
```

Handlers **never throw to the renderer**. Domain errors (`ValidationError` from a lifecycle engine, `not_found` from a service, `MarketDataError` from the broker adapter) are caught and serialised into the `errors` array. Unhandled exceptions are caught by a shared `handleIpcCall(logLabel, fn)` (or the equivalent `registerParsedPositionHandler`) and surfaced as `{ ok: false, errors: [{ field: '__root__', code: 'internal_error', message: '...' }] }`.

The renderer API adapter inspects `result.ok`; on `false` it constructs an `ApiError` (typically `apiError(400, ...)`, or `apiError(502, ...)` for market-data) so TanStack Query reports `isError`.

## Context / Why

- Throwing across the IPC boundary loses error metadata; Electron serialises the error message but not custom fields like `field` or `code`.
- A discriminated union (`ok: true | false`) gives the renderer exhaustive type narrowing.
- Field-level errors must propagate back to specific form inputs (`closePricePerContract`, `fillDate`, `strike`). A flat array of `{ field, code, message }` is the simplest shape that supports both inline form errors and root-level "position not found" type errors.
- Centralising the `try/catch` in `handleIpcCall` keeps individual handlers thin (Zod parse + service call + return).

## Alternatives considered

- **Throw exceptions across IPC** — rejected; loses structured error data and forces every renderer caller to wrap `await` in `try/catch`.
- **HTTP-style status codes inside the envelope** — rejected; over-engineered for a local IPC channel and conflates transport semantics with domain validation.
- **Per-handler error shapes** — rejected; each new handler would invent its own contract.

## Consequences

- Every new IPC handler follows the same pattern: parse payload with Zod (see ADR [zod-payload-validation](./zod-payload-validation.md)), call the service, return either the success envelope or the error envelope.
- The renderer adapter pipes `errors[]` through `mapIpcErrors(errors)` which uses the `IPC_TO_FORM_FIELD` map to translate camelCase IPC field names to the renderer's snake_case form fields — see ADR [renderer-snake-case-adapter](./renderer-snake-case-adapter.md).
- Error `field` naming follows a fixed convention — see ADR [error-field-naming-convention](./error-field-naming-convention.md).
- Market-data handlers use the same envelope but with a `502` mapping in the renderer adapter because the failure is a downstream-service failure, not user-input validation.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — `handleIpcCall` extracted during refactor; `positions:close-csp` envelope
- [extract: us-5](../../.extracts/us-5.md) — `positions:expire-csp` envelope
- [extract: us-6](../../.extracts/us-6.md) — `positions:assign-csp` envelope
- [extract: us-7](../../.extracts/us-7.md) — `positions:open-cc` envelope using shared `handleIpcCall`
- [extract: us-8](../../.extracts/us-8.md) — `positions:close-cc-early` envelope
- [extract: us-9](../../.extracts/us-9.md) — `positions:expire-cc` envelope using `handleIpcCall('positions_expire_cc_unhandled_error', ...)`
- [extract: us-12](../../.extracts/us-12.md) — `registerParsedPositionHandler` helper
- [extract: us-32](../../.extracts/us-32.md) — Market-data error mapping (`MarketDataError` → `__root__` with matching code; `502` renderer mapping)
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
