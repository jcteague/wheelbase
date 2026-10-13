# ADR: PMCC entry validation is a pure `openPmcc` engine, mirrored by the form schema

<!-- generated:from us-101,us-104,us-105 -->

## Decision

`openPmcc(input)` in `src/main/core/lifecycle.ts` owns every PMCC entry rule. It throws `ValidationError(field, code, message)` with the AC's exact messages and returns `{ phase: 'PMCC_OPEN' }` on success.

**Field paths.** Field paths are dotted: `long.fillPrice`, `short.expiration`, `short.strike`, and so on. Pair-level errors use `__pair__`. The `PmccField` type (`` 'ticker' | '__pair__' | `${'long' | 'short'}.${keyof OpenPmccLegInput}` ``) constrains every path.

**Mirror schema.** The renderer's `pmccEntrySchema` (`src/renderer/src/schemas/pmcc-entry.ts`) enforces the field-shape rules with the same messages and the cross-leg rules through `superRefine`. Its paths are pinned with `as const satisfies readonly PmccField[]`, so the two sides cannot name different fields. `__pair__` is a typed optional key of the entry schema. Server pair-level errors land in the same typed slot as client ones, which removed two casts.

**Rule order.** The unexpired-contract rule runs **before** the expiration-after-fill-date rule, in both the engine and the schema. That way, an already-expired contract entered with today's fill date gets the AC's "Use an unexpired contract…" message.

**Boundary-only rules.** Four rules have no form field: underlying mismatch, not a call, quantity mismatch, and non-standard deliverable. The form always sends `ticker`, `'CALL'`, the shared `contracts`, and `100`. These rules are covered by engine tests and by e2e calls that go straight to `window.api.createPmccPosition`.

**Shared rule functions (US-104).** The PMCC short-call roll applies the same pattern. Rules that both sides need live **once** as pure issue-reporting functions in `src/main/core/pmcc-rules.ts`, each returning `PmccIssue<F>[]` (`{ field, code, message }`):

- `pmccCrossLegIssues` (US-101) — the entry form's cross-leg rules.
- `pmccShortRollIssues` (US-104) — the roll's fill-date-on-or-after-open, coverage (`short_not_before_long`), on-or-after-current-expiration, expiration-after-fill and no-change rules. Its field type `PmccShortRollField` is derived from the engine input (`Extract<keyof RollPmccShortCallInput, 'fillDate' | 'newExpiration'> | '__roll__'`), so the form paths and the engine's `ValidationError.field` cannot diverge.
- `pmccLeapsRollIssues` (US-105) — the LEAPS roll's ordered rule list: fill date on/before the current LEAPS' expiration (`close_date_after_expiration`), on/after the position's last recorded event (`before_last_event`, message `Fill date cannot be before the last recorded event (MMM d, yyyy)`), replacement outlasting the open short (`long_not_after_short`), strike below the open short (`strike_not_below_short`), expiration after fill (`expiration_not_after_fill`) and no change. The two shape rules are skipped when `openShort` is `null`. Its field type `PmccLeapsRollField` is derived from `RollPmccLeapsInput`'s keys plus `__roll__`; its context `PmccLeapsRollContext = { currentLeaps, openShort, lastEventDate }` is what the renderer schema takes as `RollPmccLeapsContext`. `lastEventDate` comes from the pure `latestFillDate(legs)` in the same module, called by both the service and `PositionDetailPage` (which passes it to `RollPmccLeapsSheet` → `useRollPmccLeapsForm`), so the form and the engine judge the same date.

Each rule has one consumer on each side. The `rollPmccShortCall` engine in `lifecycle.ts` throws the **first** issue. The renderer `rollPmccShortCallSchema(ctx)` (`src/renderer/src/schemas/roll-pmcc-short-call.ts`) runs the same function in `superRefine` and reports the **first issue per path**. Its context (`PmccShortRollContext = { openShort, leapsExpiration }`) is the engine's own type. Undecided inputs (`undefined`) skip their rule, so a half-filled form shows no false errors. The LEAPS roll follows the same split: `rollPmccLeaps` throws the first issue after its own phase and money guards, and `rollPmccLeapsSchema(ctx)` (`src/renderer/src/schemas/roll-pmcc-leaps.ts`) reports the first issue per path, turning incomplete dates into `undefined` with `decidedDate`.

Rule messages that more than one rule set uses are shared `{ code, message }` constants (`as const satisfies PmccRule`): `SHORT_NOT_BEFORE_LONG` (with its predicate `shortExpiresBeforeLeaps`, which `pmccCrossLegIssues` also calls) and `EXPIRATION_NOT_AFTER_FILL` (used by `openPmcc`'s per-leg rule, the roll engine and the roll form). `issueIf(broken, field, rule)` takes the rule object, and `PmccIssue` is generic over its field type. US-105 adds `LONG_NOT_AFTER_SHORT` — the long-side message of the same comparator, reported by calling `shortExpiresBeforeLeaps` with the arguments swapped (one predicate, two messages, as US-102 intends) — plus `shortStrikeAboveLeaps` (now also behind `pmccCrossLegIssues`'s `strike_not_above_long`), `STRIKE_NOT_BELOW_SHORT_CODE` / `leapsStrikeNotBelowShortMessage(shortStrike)`, and `ROLL_NO_CHANGE`, now shared by both PMCC rolls.

**Envelope change.** `handleIpcCall` now builds a Zod issue's `field` with `issue.path.join('.')`, falling back to `__root__`, where it used to take `path[0]`. The change is backward-compatible for every single-segment path, and `ValidationError` dotted fields pass through unchanged.

## Context / Why

- Engines are pure and own the rules ([pure-core-engines](./pure-core-engines.md)). The story says to "use the same validation at the main-process boundary".
- Dotted paths map one-to-one onto React Hook Form's nested `setError('long.fillPrice')`, so server errors land on the right input with no translation table.

## Alternatives considered

- **(US-104) Re-spell the roll's date and no-change rules in the form schema** — the first draft did this. It restated the open short as `current*` form fields and copied rules 3, 8 and 10. Rejected in review: it duplicates codes and messages that then drift apart.
- **(US-104) Copy the short-vs-LEAPS comparison inline in `rollPmccShortCall`, or pass `pmccCrossLegIssues` the whole pair** — rejected. Copying is "the exact drift US-102 exists to prevent", and the cross-leg set also runs fill-date, strike-above-long and net-debit rules that do not apply to a roll. US-104 extracted only the short-side comparator; US-102 keeps the inverse message.
- **(US-104) Share a `requireRollChanges` with the wheel's `rollCc`** — rejected. It would parameterise both messages and change `rollCc`'s strike comparison from string equality to `Decimal.eq`, which is a behaviour change, not a refactor.
- **(US-105) Have the LEAPS form schema spread the individual rule constants in its own `superRefine`** — the plan's design. Superseded during implementation by one ordered list, `pmccLeapsRollIssues`, so the rule order and the fill-date rules added in review exist in exactly one place for both sides.
- **(US-105) A named alias `leapsExpiresAfterShort`** for the long-side comparison — rejected; a second function for one comparison invites divergence.
- **A flat payload (`longStrike`, `shortStrike`, …).** Rejected: it loses the named legs and would make US-104 / US-105 inconsistent.
- **Zod-only validation.** Rejected: Zod cannot express the custom error codes.

## Consequences

- Numeric bounds are deliberately **not** in the IPC Zod schema; the engine owns those messages. Zod only checks shape, plus the two per-leg "Enter the actual … fill price." messages for missing fills.
- Property tests check that generated valid input is accepted, that the strike, expiration, net-debit and put guards fire, and that every thrown `field` is a member of `PmccField`.
- Extends [error-field-naming-convention](./error-field-naming-convention.md) with dotted paths and `__pair__`, and [zod-payload-validation](./zod-payload-validation.md) with the shared `IsoDateSchema`.
- **(US-104)** The roll engine's rule order is fixed: phase → open short exists → fill date not before the open short → the three money/strike `must_be_positive` guards → coverage → on/after current → expiration after fill → no change. The engine calls `pmccShortRollIssues` once. It throws a `fillDate` issue before the money guards and any other issue after them, so a $0.00 cost to close is reported beside its field even when the dates are also wrong. The money/strike guards are not in the shared function; the form's `moneySchema` carries the same messages. Strike equality for no-change uses `Decimal.eq`.
- **(US-104)** Because the schema mirrors the engine, the roll sheet disables confirm on `!schema.safeParse(values).success` (not RHF `isValid`, which a `root.save` error would also force false). Server `ValidationError` fields route back onto the form through `applyIpcFieldErrors` (`src/renderer/src/lib/ipc-field-errors.ts`), shared with `PmccEntryForm`.
- **(US-104)** Property tests in `pmcc-rules.property.test.ts` check that the comparator matches a calendar-day `<` and that the cross-leg issue fires exactly when `!shortExpiresBeforeLeaps`. `lifecycle.property.test.ts` adds `rollPmccShortCall` to the phase guards, plus a coverage guard and a valid-input invariant.
- **(US-105)** The LEAPS roll engine's order: phase → proceeds → replacement debit → strike positive (the engine's own guards) → `pmccLeapsRollIssues` (fill date ≤ LEAPS expiration → fill date ≥ last recorded event → covers the open short → strike below it → expiration after fill → no change). The engine returns `RollPmccLeapsAccepted` (US-104's engine result is now `RollPmccShortCallAccepted`), keeping the core names apart from the IPC result types. There is no on-or-after-current rule. The sheet disables confirm on `!schema.safeParse(values).success` like the short roll; the fill-date input declares RHF `deps: 'newExpiration'` so editing it re-checks the expiration-after-fill rule.
- **(US-105)** Property tests: `pmcc-rules.property.test.ts` checks `shortStrikeAboveLeaps` against `Decimal.gt` and the LEAPS roll's before-last-event and replacement-expiry rules; `lifecycle.property.test.ts` adds `rollPmccLeaps` to the phase guards plus coverage, strike, no-short-skip and valid-input properties.
- The helper `requireNonNegativeDecimal` was renamed `requireNonNegativeFees`. The wheel's `openWheel` / `openCoveredCall` were deliberately not switched to the per-leg helpers because their messages differ.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [extract: us-104](../../.extracts/us-104.md) — ADRs "The roll's date and no-change rules live once in `pmccShortRollIssues`", "`rollPmccShortCall` is a new pure lifecycle function with a fixed rule order", "US-104 … carries the short-side half of US-102's comparator extraction"
- [extract: us-105](../../.extracts/us-105.md) — ADRs "The LEAPS roll's rules are one ordered pure list shared by engine and form", "The long-side half of US-102 and the strike-ordering predicate live in `pmcc-rules.ts`"
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
- [feature: us-104-roll-pmcc-short-call](../../features/us-104-roll-pmcc-short-call.md)
- [feature: us-105-roll-pmcc-leaps](../../features/us-105-roll-pmcc-leaps.md)
<!-- /generated -->
