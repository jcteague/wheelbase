# ADR: Event-marker legs — `EXPIRE`, `ASSIGN` have no fill price, no active-leg status

<!-- generated:from us-5, us-6, us-9 -->

## Decision

Some legs are recorded purely as **event markers**, not as open trading positions:

- **EXPIRE legs** (CSP or CC expiring worthless): `action = 'EXPIRE'`, `leg_role = 'EXPIRE'`, `premium_per_contract = '0.0000'`, `fill_price = NULL`, `fill_date = <option's expiration date>`.
- **ASSIGN legs** (CSP assigned, stock delivered): `action = 'ASSIGN'`, `leg_role = 'ASSIGN'`, `instrument_type = 'STOCK'`, `premium_per_contract = '0.0000'`, `fill_price = NULL`, `fill_date = <assignment date>`.

Because the option no longer exists as an open position, `getPosition.activeLeg` returns `null` for `HOLDING_SHARES` positions (the CSP became shares; there is no live option leg). The EXPIRE / ASSIGN leg is preserved in `legs[]` as audit history but is not the "active" leg.

`premium_per_contract = '0.0000'` semantically reflects "no premium changed hands on this event"; `fill_price = NULL` semantically reflects "there was no market fill on this event".

## Context / Why

- A short option that expires worthless has no closing transaction — it ceases to exist. The EXPIRE leg is purely an event marker so the leg-history table can show the lifecycle event.
- Assignment is a broker-initiated stock delivery; there is no "purchase price" in the market sense. The ASSIGN leg records the delivery, not a buy.
- Distinguishing `premium_per_contract = '0.0000'` (no premium) from `fill_price = NULL` (no fill) preserves the truth: a `BUY` close-to-close leg has `premium_per_contract = closePrice` AND `fill_price = closePrice`, but an EXPIRE has `premium = 0` and `fill_price = NULL`. They are not the same.
- `activeLeg = null` for `HOLDING_SHARES` is the cleanest contract: the renderer already guards `activeLeg && ...` before rendering the open-leg card.

## Alternatives considered

- **Don't record EXPIRE / ASSIGN legs at all** — rejected; loses audit trail, breaks leg-history display, can't reconstruct the wheel timeline.
- **Use `action = 'BUY'` with `fill_price = 0` for expirations** — rejected; semantically wrong (no buy occurred) and pollutes the leg-history rendering.
- **Set `fill_price = 0` instead of `NULL`** — rejected; conflates "no money changed hands at price zero" with "no fill at all"; `NULL` is the honest answer for the latter.

## Consequences

- The `LegAction` enum extends to `SELL | BUY | EXPIRE | ASSIGN` (started as `SELL | BUY`; expanded in US-5 then US-6).
- `LegRole` already contained `EXPIRE` and `ASSIGN` values; no new schema CHECK was needed for those.
- The expiration snapshot uses `snapshot_at = now + 1ms` so it sorts after the opening snapshot when both are written within the same millisecond.
- The CC-expire flow writes only the EXPIRE leg (no new snapshot; see ADR [append-only-cost-basis-snapshots](./append-only-cost-basis-snapshots.md)) because the CC premium was already booked at CC-open.

## Sources

- [extract: us-5](../../.extracts/us-5.md) — ADR "Add `'EXPIRE'` to the `LegAction` enum"; expire leg's `fill_price = NULL`
- [extract: us-6](../../.extracts/us-6.md) — ADR "Add `'ASSIGN'` to `LegAction` enum"; ADR "ASSIGN leg as event marker" + ADR "`activeLeg` returns `null` for `HOLDING_SHARES` positions"
- [extract: us-9](../../.extracts/us-9.md) — CC EXPIRE leg follows the same pattern
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
- [feature: us-6-record-assignment](../../features/us-6-record-assignment.md)
- [feature: us-9-expire-cc](../../features/us-9-expire-cc.md)
<!-- /generated -->
