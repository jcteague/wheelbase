# ADR: IPC channel naming — `{domain}:{verb}-{noun}`
<!-- generated:from us-4, us-5, us-6, us-7, us-8, us-9, us-12, us-32 -->

## Decision

IPC channels follow the pattern `{domain}:{verb}-{noun}`. For position lifecycle: `positions:create`, `positions:get`, `positions:list`, `positions:close-csp`, `positions:expire-csp`, `positions:assign-csp`, `positions:open-cc`, `positions:close-cc-early`, `positions:expire-cc`, `positions:roll-csp`. For market data: `market-data:stock-quotes`, `market-data:set-stock-quote-tickers`, `market-data:market-status`, `market-data:stock-quote` (push event), `market-data:stream-error` (push event).

Companion conventions:

- Preload method names are camelCase verbs that mirror the channel (`closeCoveredCallEarly`, `expireCc`, `rollCsp`, `setStockQuoteTickers`).
- The shared `handleIpcCall` log label uses `{domain}_{verb}_{noun}_unhandled_error` snake-cased — e.g. `positions_close_cc_early_unhandled_error`, `positions_roll_csp_unhandled_error`.

## Context / Why

- Channels are global strings; consistent naming makes them greppable and avoids naming drift as the surface grows.
- The verb-noun structure expresses intent (`expire-cc`, not `cc:expire`) and keeps the domain prefix grouped.
- Abbreviating "covered call" to `cc` and "cash-secured put" to `csp` keeps channel names short and matches the project's enum values (`CC_OPEN`, `CSP_OPEN`).

## Alternatives considered

- **REST-style nesting (`positions/:id/close`)** — rejected; channels are flat strings, not routes; nesting adds no value and breaks grep.
- **Domain-only channels (`positions:mutate`)** — rejected; loses verb specificity; forces a discriminator inside the payload.
- **Spelling out "covered-call"** — rejected; `positions:expire-covered-call` is too verbose given the established abbreviation.

## Consequences

- Every new IPC handler follows the pattern. Refactor pass for US-9 explicitly chose `positions:expire-cc` over `positions:expire-covered-call`.
- The preload bridge adds one camelCase method per channel; the renderer adapter exposes a snake-case-payload wrapper.
- Log labels for `handleIpcCall` follow the same skeleton with `unhandled_error` suffix.

## Sources

- [extract: us-4](../../.extracts/us-4.md) — `positions:close-csp`, `positions:get`
- [extract: us-5](../../.extracts/us-5.md) — `positions:expire-csp`
- [extract: us-6](../../.extracts/us-6.md) — `positions:assign-csp`
- [extract: us-7](../../.extracts/us-7.md) — `positions:open-cc`
- [extract: us-8](../../.extracts/us-8.md) — `positions:close-cc-early`
- [extract: us-9](../../.extracts/us-9.md) — ADR "IPC channel naming follows established convention"
- [extract: us-12](../../.extracts/us-12.md) — `positions:roll-csp`
- [extract: us-32](../../.extracts/us-32.md) — `market-data:*` channels (request/response + push events)
- [feature: us-4-close-csp](../../features/us-4-close-csp.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
- [feature: us-32-live-position-prices](../../features/us-32-live-position-prices.md)
<!-- /generated -->
