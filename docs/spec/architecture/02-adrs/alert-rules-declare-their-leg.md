# ADR: Alert rules declare the leg they read; an absent leg makes a rule inapplicable, not skipped

<!-- generated:from us-107 -->

## Decision

Every entry in the alert rule registry (`RULES` in `src/main/core/alerts.ts`) declares which leg of the position it reads, through a required `leg: RuleLeg` field, where `RuleLeg = 'short' | 'leaps'`. A `LEG_PRESENT: Record<RuleLeg, (input) => boolean>` table says whether that leg is open on the evaluation input:

```text
LEG_PRESENT.short(input) = input.instrumentType ≠ null
LEG_PRESENT.leaps(input) = input.phase = 'PMCC_OPEN'
```

`evaluatePosition` filters the registry to the rules whose leg is present **before** it computes skips and matches. A rule whose leg is absent is _inapplicable_: it produces neither a match nor a skip. Because it contributes no key to the run's keep-open set, any alert it raised earlier resolves through the normal global resolution ([alert-resolution-global](./alert-resolution-global.md)).

Every rule that existed before US-107 (`EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`, `PROFIT_TARGET`, `STRIKE_PROXIMITY`, `EARNINGS_PROXIMITY`, `COVERED_CALL_BREACH`, `PMCC_ASSIGNMENT_RISK`) declares `leg: 'short'`. `PMCC_LEAPS_ROLL_WINDOW` declares `leg: 'leaps'`. The engine input keeps the short leg in the existing `dte` / `strike` / `expiration` / `instrumentType` fields and carries the LEAPS in separate `leapsDte` / `leapsStrike` fields, so a short-leg rule cannot read the LEAPS by accident.

## Context / Why

- **The LEAPS-only hazard.** US-107 makes a PMCC evaluable whenever its LEAPS is open, including after its short call has expired. On such a position the short-leg fields are all null. If the short-leg rules still ran, they would **skip** with `missing_dte`, `missing_strike` or `missing_option_mark`. A skip keeps the alert open, because a skipped rule "was not evaluated" ([alert-engine-pure-matches-skips](./alert-engine-pure-matches-skips.md)). The expired short's `EXPIRATION_IMMINENT`, and US-106's `PMCC_ASSIGNMENT_RISK`, would then stay open forever. US-106's `priceVsStrikeMissingData('PMCC_OPEN')` is the concrete case: with a null short strike it returns `missing_strike`.
- **"Not applicable" is not "data missing".** A skip means "this rule applies, but its input is unknown this run, so leave its alert alone". An absent leg means "there is nothing for this rule to watch", which must clear the alert. The two need different outcomes, so they need different mechanisms.
- **One table instead of a convention.** Answering "which leg does this rule read" in one place makes "the short-call rules and the LEAPS rule never read each other's leg" a property of the registry, not something each rule's guard has to remember. Because `leg` is required and `LEG_PRESENT` is an exhaustive `Record`, a future rule that omits its leg, or a new leg kind without a presence test, fails to compile.
- **LEAPS presence uses the phase, not the DTE.** A PMCC whose LEAPS expiration cannot be read must **skip** with `missing_leaps_dte`, keeping its alert open, rather than become inapplicable and resolve it. Testing `leapsDte !== null` would conflate the two.
- **Wheel behaviour is unchanged.** Wheel rows always carry an `instrumentType`, because the wheel query inner-joins an option leg, and only a PMCC is in `PMCC_OPEN`. So every wheel rule stays applicable exactly as before and the LEAPS rule never applies to a wheel.

## Alternatives considered

- **A per-rule `instrumentType === null` check inside each `missingData` guard.** Rejected: five copies of the same gate, easy to forget on the next rule, and a guard returns a _skip_, which is the wrong outcome.
- **A new LEAPS-only PMCC phase.** Rejected: US-101 uses `PMCC_OPEN` for both states, and a new phase would ripple into the lifecycle engine, the positions list and the detail page.
- **Feed the LEAPS through `dte` / `strike` as a second evaluation per position.** Rejected: it would trip `MANAGEMENT_WINDOW` / `EXPIRATION_IMMINENT` on the LEAPS, which US-106 forbids.
- **A nested `short: {…} | null` engine input.** It would make "short absent" structural, but would rewrite every rule and fixture; judged out of proportion.

## Consequences

- A LEAPS-only PMCC is evaluated by the LEAPS rule alone; the expired short's alerts resolve on the next run.
- A PMCC with both legs open runs the short-leg rules on the short and the LEAPS rule on the LEAPS; the two can co-fire as separate rows.
- The registry header in `alerts.ts` documents the rule: "a rule whose leg is absent produces neither a match nor a skip, so its stale alert resolves."
- Property tests pin it: for a PMCC with `instrumentType: null`, no rule other than `PMCC_LEAPS_ROLL_WINDOW` appears in `matches` or `skipped`; and setting the LEAPS fields never changes another rule's matches or skips.
- Extends [alert-rule-registry](./alert-rule-registry.md). The service-side selection that produces LEAPS-only rows is recorded as an amendment to [pmcc-alerts-select-current-short-by-ledger-replay](./pmcc-alerts-select-current-short-by-ledger-replay.md).

## Sources

- [extract: us-107](../../.extracts/us-107.md): ADR "Rules declare which leg they read; an absent leg makes a rule inapplicable"
- `plans/us-107/research.md` (ADR 2), `plans/us-107/data-model.md` (§ Applicability, § Type Design)
- `src/main/core/alerts.ts` — `RuleLeg`, `LEG_PRESENT`, `RuleDefinition.leg`, `evaluatePosition`
- Feature page: [us-107-pmcc-leaps-roll-window-alert](../../features/us-107-pmcc-leaps-roll-window-alert.md)
- Domain page: [alerts](../../domain/alerts.md)
<!-- /generated -->
