# US-102 — Red phase evidence

Requirements: [OPT-11](https://linear.app/optionswheel/issue/OPT-11).
Plan: [plan.md](./plan.md). Existing passing scenarios are regressions, as the plan requires.

## Shared calendar rule

See [area-a-results.md](./area-a-results.md): five new invalid-calendar assertions
failed against lexical ordering; 320 other targeted tests passed before the change.
Independent UTC chronology properties cover entry and both lifecycle roll consumers.

## New York date helper

`TZ=UTC pnpm test src/renderer/src/lib/dates.test.ts` failed seven new tests because
`newYorkToday` did not exist; the five pre-existing local-date tests passed.
Output: `/private/tmp/wb-102-dates-red.log`.

The helper tests cover the UTC/New York day difference, year boundary, both DST
transitions and the default clock. Public interface: `newYorkToday(now?: Date): string`.
No property test applies to this renderer clock adapter; fixed instants establish
the timezone contract. `format.test.ts` separately verifies the 67-day arithmetic
example through the existing DTE helper, without claiming US-115 workflow coverage.

## Existing service and IPC consumers

See [area-c-e-results.md](./area-c-e-results.md): all 117 targeted tests passed
immediately, including the new live-opposite-leg and real-handler cases. These
are regressions for shipped behavior; no failing implementation was fabricated.

## Roll sheets and forms

See [area-d-results.md](./area-d-results.md): under `TZ=UTC`, the two new sheet
default-date assertions failed because they selected September 15 instead of
New York's September 14 at `2026-09-15T01:00Z`. The other 108 tests passed.
Output: `/private/tmp/wb-102-area-d-red.log`. Fixed-date DTE, client rejection,
retained draft/cash/net, disabled treatment and server retry are covered.

## Electron consumers

The nine new current-workflow cases passed on their first run, alongside all
67 existing entry/roll regressions (76 total). This confirms shipped paths;
the actual missing calendar/timezone behavior is reproduced above.
See [area-f-results.md](./area-f-results.md).
