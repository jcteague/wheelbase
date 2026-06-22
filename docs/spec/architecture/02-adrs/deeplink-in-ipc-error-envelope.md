# ADR: deeplink as top-level field on IPC error envelope

<!-- generated:from us-47-49 -->

## Decision

When a `BrokerError` carries a `deeplink` value, the `{ ok: false }` IPC envelope includes it as a **top-level field** alongside `errors[]`:

```ts
{ ok: false, deeplink: 'settings/credentials/alpaca', errors: [{ field: '__root__', code: 'auth_failed', message: '...' }] }
```

`deeplink` is absent from the envelope when the underlying error has no navigation hint.

## Why

The renderer needs the deeplink to navigate the user to the right settings screen on auth failure. Top-level placement keeps it symmetric with `code` (already top-level on some envelopes) and avoids forcing renderer callers to dig into `errors[0]` for a call-level concern.

Deeplinks are a per-call concern, not a per-field-validation concern — they answer "where should the user go to fix this?" rather than "which form field is invalid?".

## Alternatives considered

- **Embed `deeplink` inside `errors[0]`** — rejected; callers would have to scan the `errors[]` array for something that is logically a property of the entire call response, not of one field.
- **Separate `router` field** — rejected; unnecessary indirection over `deeplink` with no clarity gain.
- **Emit a separate IPC event to trigger navigation** — rejected; out-of-band events would race the response and complicate the renderer's error-handling state machine.

## Consequences

- `handleIpcCall` in `src/main/ipc/utils.ts` has a dedicated `BrokerError` branch (split from `MarketDataError`) that spreads `...(err.deeplink ? { deeplink: err.deeplink } : {})` onto the envelope.
- The `{ ok: false }` return-type union includes `deeplink?: string`.
- Only `BrokerError` carries a deeplink today; `MarketDataError` does not (it has no equivalent navigation target).
- This is an extension of the base envelope — the canonical `{ ok, errors }` contract from [ipc-envelope-contract](./ipc-envelope-contract.md) still holds; `deeplink` is additive.

## Sources

- [extract: us-47-49](../../.extracts/us-47-49.md) — ADR "deeplink as top-level IPC envelope field"
- [feature: us-47-49-broker-ac-hardening](../../features/us-47-49-broker-ac-hardening.md)
<!-- /generated -->
