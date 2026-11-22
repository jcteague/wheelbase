# ADR: PMCC phase and leg-role names

<!-- generated:from us-101,us-115 -->

## Decision

PMCC phases live on the shared `WheelPhase` enum under a `PMCC_` prefix. US-101 adds only the phase it produces:

- **Added:** `PMCC_OPEN`. `TriggerEvent` also gains `PMCC_OPEN`.
- **Reserved by name, not added:** `PMCC_CLOSED` (US-111 / US-120).
- **Reservation dropped (US-115):** `PMCC_LEAPS_ONLY`. US-101 reserved it for US-119 / US-115, meaning the short call is gone and the LEAPS is still held. US-115 decided that `PMCC_OPEN` stays the only open PMCC phase. Whether a short is open is derived from the open legs (`pmccOpenLegs.short`) and never stored. "LEAPS open · no short call" and "LEAPS + short call open" are labels computed by the renderer's `pmccCoverageLabel`, not phases. US-115, US-119 and US-120 share this convention.

Leg roles:

- **Added:** `LEAPS_OPEN` (`BUY`, `CALL`) and `SHORT_CALL_OPEN` (`SELL`, `CALL`). US-115 writes a second, post-entry `SHORT_CALL_OPEN` for each subsequent short and adds no role.
- **Reserved by US-101:** `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED`. All six PMCC roles exist in the enum by the time US-115 lands.

Labels:

- `PHASE_LABEL.PMCC_OPEN` and `PHASE_LABEL_SHORT.PMCC_OPEN` are `'LEAPS + short call open'`. Since US-115, the detail header's `PhaseBadge` shows `pmccCoverageLabel` for a `PMCC_OPEN` position instead, and `PHASE_LABEL.PMCC_OPEN` stays for the list.
- `LEG_ROLE_LABEL` maps the two roles to `'Buy LEAPS call'` / `'Sell short call'`.
- `PHASE_COLOR.PMCC_OPEN` is distinct from every wheel phase.

## Context / Why

- The story forbids overloading `CC_OPEN`.
- The prefix keeps the wheel-only jobs' SQL `phase IN (…)` filters correct by construction: a PMCC phase can never match a wheel filter.
- Only produced phases enter the enum, so exhaustive `Record<WheelPhase, …>` maps never need entries for phases that nothing can reach.
- **Why no LEAPS-only phase (US-115).** The code already answers "is a short open?" by replaying legs (US-104 – US-108), and US-107 had rejected a LEAPS-only phase. Adding one would force:
  - a migration of every existing PMCC row;
  - a phase write in US-104, US-105 and US-119;
  - new entries in every `Record<WheelPhase, …>` map.

  All of that would be for a fact the legs already carry.

## Alternatives considered

- **A separate `PmccPhase` enum with a `phase` union type.** Rejected: it adds a second type everywhere a phase is read.
- **Overload `CC_OPEN` and tell the strategies apart by `strategy_type`.** Rejected by the story.
- **Add `PMCC_LEAPS_ONLY` as reserved** (US-115). The story's Technical Notes read "requires the LEAPS-only phase … returns the LEAPS-plus-short phase". Rejected, and the decision was kept when US-115's Open Question 3 was resolved.

## Consequences

- US-101 owns these names. US-119, US-120 and US-111 consume them. US-120 or US-111 adds `PMCC_CLOSED` when it first produces it. US-115 and US-119 add no phase.
- Header gating must check `phase === 'PMCC_OPEN'` as well as the open legs. US-120 keeps `pmccOpenLegs` non-null on a closed PMCC, so the legs alone would still offer open-position actions.
- Adding a phase value forces every `Record<WheelPhase, …>` map (label, short label, colour) to handle it at compile time.
- Wheel-only jobs need no PMCC-specific code. See [pmcc-list-item-discriminated-union](./pmcc-list-item-discriminated-union.md).

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [extract: us-115](../../.extracts/us-115.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
- [feature: us-115-sell-subsequent-pmcc-short-call](../../features/us-115-sell-subsequent-pmcc-short-call.md)
<!-- /generated -->
