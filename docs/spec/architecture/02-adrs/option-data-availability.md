# ADR: Greeks/IV via REST snapshot only; OI/volume always null

<!-- generated:from us-31,market-data-massive-migration -->

## Decision

`OptionSnapshot.greeks` and `OptionSnapshot.iv` are populated only by the REST `/v1beta1/options/snapshots` endpoint. Stream events never carry them. `openInterest` and `volume` are typed `number | null` on `OptionSnapshot` and are always `null` for Alpaca — both are absent from every Alpaca option endpoint.

## Why

Alpaca's option streaming carries only quote (bid/ask) and trade (price/size) data. Greeks and IV come from the REST snapshot endpoint. Open interest is not available from Alpaca at all; daily volume is similarly absent. Encoding the limitation in the types means downstream stories (US-33's profit-target check, US-34's Greeks display) can't accidentally assume Greeks on a stream frame.

## Alternatives considered

- **Derive volume from `getOptionsBars()`** — possible but adds complexity for no near-term benefit.
- **Source OI from a different provider** — out of scope; would require a second integration.

## Source

- `plans/us-31/research.md`
- Feature page: `../../features/us-31-market-data-provider-adapter.md`
<!-- /generated -->
