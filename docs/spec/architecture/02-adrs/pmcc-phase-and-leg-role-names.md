# ADR: PMCC phase and leg-role names

<!-- generated:from us-101 -->

## Decision

PMCC phases live on the shared `WheelPhase` enum under a `PMCC_` prefix. US-101 adds only the phase it produces:

- **Added:** `PMCC_OPEN` (LEAPS + short call open). `TriggerEvent` also gains `PMCC_OPEN`.
- **Reserved by name, not added:** `PMCC_LEAPS_ONLY` (US-119 / US-115) and `PMCC_CLOSED` (US-111 / US-120).

Leg roles:

- **Added:** `LEAPS_OPEN` (`BUY`, `CALL`) and `SHORT_CALL_OPEN` (`SELL`, `CALL`).
- **Reserved:** `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED`.

Labels: `PHASE_LABEL.PMCC_OPEN` and `PHASE_LABEL_SHORT.PMCC_OPEN` are `'LEAPS + short call open'`; `LEG_ROLE_LABEL` maps the two roles to `'Buy LEAPS call'` / `'Sell short call'`. `PHASE_COLOR.PMCC_OPEN` is distinct from every wheel phase.

## Context / Why

- The story forbids overloading `CC_OPEN`.
- The prefix keeps the wheel-only jobs' SQL `phase IN (…)` filters correct by construction: a PMCC phase can never match a wheel filter.
- Only produced phases enter the enum, so exhaustive `Record<WheelPhase, …>` maps never need entries for phases that nothing can reach.

## Alternatives considered

- **A separate `PmccPhase` enum with a `phase` union type.** Rejected: it adds a second type everywhere a phase is read.
- **Overload `CC_OPEN` and tell the strategies apart by `strategy_type`.** Rejected by the story.

## Consequences

- US-101 owns these names. US-115, US-119, US-120 and US-111 consume them, and each adds its reserved phase or role when it first produces it.
- Adding a phase value forces every `Record<WheelPhase, …>` map (label, short label, colour) to handle it at compile time.
- Wheel-only jobs need no PMCC-specific code. See [pmcc-list-item-discriminated-union](./pmcc-list-item-discriminated-union.md).

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
