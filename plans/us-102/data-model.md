# US-102 — Shared expiration invariant

Requirements remain in [OPT-11](https://linear.app/optionswheel/issue/OPT-11).
See [research.md](./research.md) for verified implementation and dependency direction.

## Entities and invariant

No new persisted entities, fields, migrations or phase transitions.

- The current PMCC pair comes from `getPosition(...).pmccOpenLegs` through
  `loadPmccRollContext`, never opposite-leg dates supplied by the renderer.
- A short roll compares the proposed short expiration to the current LEAPS.
- A LEAPS roll compares the current short expiration to the proposed LEAPS;
  `openShort === null` skips the coverage rule.
- A subsequent short compares its proposed expiration to the current LEAPS;
  US-115 owns that service, form, phase transition and write transaction.
- The resulting pair requires `shortExpiration < longExpiration`. Equality
  rejects. Displayed DTE, strike, original opening dates and preferred DTE ranges
  do not determine this invariant.

Both existing roll engines validate before `recordPmccRoll` writes their linked
legs and snapshot. Rejection preserves all legs, roll chains, snapshots and the
position. Entry and classic-wheel behavior retain their existing contracts.

## Stable validation contract

| Export / consumer                                                                   | Contract                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shortExpiresBeforeLeaps(shortExpiration: string, longExpiration: string): boolean` | Existing pure comparator; use date-fns `isBefore` with `parseISO` for calendar dates. Valid input is canonical `YYYY-MM-DD`; invalid parsed dates cannot establish coverage. |
| `SHORT_NOT_BEFORE_LONG`                                                             | Code `short_not_before_long`; message `Short call must expire before the LEAPS call.`                                                                                        |
| `LONG_NOT_AFTER_SHORT`                                                              | Code `long_not_after_short`; message `LEAPS call must expire after the short call.`                                                                                          |
| Entry                                                                               | `pmccCrossLegIssues` reports short-side error on `short.expiration`.                                                                                                         |
| Short roll                                                                          | `pmccShortRollIssues` reports short-side error on `newExpiration`.                                                                                                           |
| LEAPS roll                                                                          | `pmccLeapsRollIssues` reports inverse error on `newExpiration`; no coverage error without a short.                                                                           |
| Subsequent short (US-115)                                                           | Consume the short-side predicate/message at the proposed expiration field; do not duplicate the comparator.                                                                  |

IPC remains `handleIpcCall`'s `{ ok: false, errors: [{ field, code, message }] }`
on rejection, and the existing roll result on success. No new IPC surface means
no `contracts/` artifact is needed. US-115 owns its future IPC schema.

## Review dates

Add `newYorkToday(now?: Date): string` in renderer `lib/dates.ts` using native
Intl with explicit `America/New_York` and numeric year/month/day parts. Default
`now` at the call boundary. Use this as the two roll sheets' default `today`;
keep explicit `today` injection for deterministic tests. Their existing date-fns
DTE computations and coverage rulers consume that date. The shared form date
also supplies the default fill date; do not change wheel or entry date defaults.

At valuation date 2026-09-14, independently verify replacement 2027-02-19 is
158 DTE, 2028-01-21 is 494 DTE and 2026-11-20 is 67 DTE. The last figure is a
shared date regression now and a US-115 workflow assertion later.

## Type Design

Applied `typescript-advanced-types`: plain types — no advanced constructs needed
beyond the existing derivations. Do not introduce a new domain wrapper.

| Symbol                                                   | File                          | Design                                                                                                      |
| -------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PmccRule`                                               | `src/main/core/pmcc-rules.ts` | Existing `Pick<PmccIssue, 'code' \| 'message'>`; both message objects retain `as const satisfies PmccRule`. |
| `PmccShortRollField`, `PmccLeapsRollField`               | `src/main/core/pmcc-rules.ts` | Reuse existing field derivations; no new error fields.                                                      |
| `RollPmccShortCallFormValues`, `RollPmccLeapsFormValues` | Renderer roll schemas         | Retain Zod-inferred types and existing error routing.                                                       |
| Comparator and `newYorkToday`                            | Core rules / renderer dates   | Ordinary function signatures, no new named type.                                                            |

## US-115 handoff

The shared prerequisite is ready when comparator/messages and existing consumer
regressions pass. US-115 then uses the live LEAPS expiration in its engine and
form; rejects equality/inversion before leg/snapshot writes; preserves user
inputs after rejection; and implements the two named subsequent-short scenario
families in the plan. Do not claim those workflow scenarios passed under US-102
and do not create skipped placeholder E2Es to simulate completion.
