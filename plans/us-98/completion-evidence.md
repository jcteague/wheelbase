# Completion Evidence: US-98 — IV-rank staleness tiers

**Recorded:** 2026-09-10 · **Status:** 11 of 13 acceptance criteria shipped and verified.

## Acceptance criteria coverage

Every row is one verbatim-named `it()` in `e2e/ivr-staleness.spec.ts`, driving the real
screener page over the real IPC, real collector and real freshness engine.

| AC   | Scenario                                                       | Result             |
| ---- | -------------------------------------------------------------- | ------------------ |
| AC1  | A reading from the last close shows without an age qualifier   | ✅ passing         |
| AC2  | Friday's close is still fresh on Monday morning                | ✅ passing         |
| AC3  | An exchange holiday does not age a reading                     | ✅ passing         |
| AC4  | An aging reading shows its age but stays usable                | ✅ passing         |
| AC5  | A stale reading is muted and cannot satisfy an IV condition    | ⛔ blocked — US-96 |
| AC6  | An expired reading is indistinguishable from no reading        | ✅ passing         |
| AC7  | An earnings print invalidates a reading regardless of age      | ✅ passing         |
| AC8  | A print before the observation does not invalidate the reading | ✅ passing         |
| AC9  | Missing earnings knowledge falls back to the time tiers alone  | ✅ passing         |
| AC10 | A stale IV rank never blocks a candidate from ranking          | ✅ passing         |
| AC11 | The IV-rank floor is not applied to a stale reading            | ✅ passing         |
| AC12 | The IV-rank floor is not applied to an expired reading         | ✅ passing         |
| AC13 | Signal refuses to claim entry readiness on an unusable reading | ⛔ blocked — US-96 |

AC5 and AC13 both assert on the watchlist Signal verdict. US-96 is absent from this
checkout — there is no `deriveSignal`, no snapshot service, and `WatchlistPage` still
renders only Ticker / Thesis / Added / Remove. They are **omitted from the spec file
rather than written as skips**, so the suite claims no coverage it does not have.

Additional regression coverage in `e2e/ivr-collector.spec.ts`:

- `AC: A recognised weekday holiday skips collection with no fetch`
- `AC: The holiday guard still holds with no broker configured` — seeds the calendar with
  a broker, relaunches with no credentials, and proves the cached calendar still refuses
  the holiday run and the previous good reading survives.

## Test execution

```
pnpm test
  Test Files  203 passed (203)
       Tests  2651 passed (2651)

pnpm test:e2e
  Test Files  32 passed (32)
       Tests  289 passed | 1 todo (290)

npx vitest run --config vitest.e2e.config.ts e2e/ivr-staleness.spec.ts
  Test Files  1 passed (1)
       Tests  11 passed (11)
```

## Quality gates

- ✅ `pnpm test`
- ✅ `pnpm lint`
- ✅ `pnpm typecheck` (node + web)
- ✅ `pnpm format`

## Test-sensitivity check (in place of a Red phase)

Layers 1–3 were already Green when the acceptance suite was written, so these tests
passed on their first run — they were never seen to fail for the right reason. Rather
than record that as a proper Red phase, sensitivity was proved by mutation:

| Mutation                                             | Result                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| AC4: observation aged one extra session              | ❌ `expected '38 · 3d' to be '38 · 2d'`                            |
| AC3: holiday removed from the fake exchange calendar | ❌ `expected '1 trading day old…' to contain '0 trading days old'` |

Both mutations were reverted and the suite re-verified green. The second is the more
valuable of the two: it exercises the whole path from `FAKE_BROKER_CALENDAR` through
`getMarketCalendar`, the `trading_session` cache and `countCompletedSessionsAfter` out to
the rendered cell.

## Not done

- **Prerequisite gate — trader validation of the tier boundaries.** Fresh 0–1 /
  Aging 2–3 / Stale 4–10 / Expired >10 shipped as constants in `core/ivr-freshness.ts`,
  but they remain the plan's _proposed_ values.
- **Prerequisite gate — US-96.** Blocks Layer 4 entirely (watchlist assessed IVR and the
  unknown Signal gate), and with it AC5 and AC13.
- **Live UI QA under the `qa-test` skill.** Not run.
- **Mockup annotations.** `mockups/us-66-screener-results.mdx` carries the ranked-table
  IVR states; `mockups/us-63-watchlist-manager.mdx` is untouched, since the watchlist
  states it would document do not exist yet.

## Documentation

- Spec refreshed via `/update-spec us-98`: new feature page, five new ADRs, the amended
  `ivr-non-trading-day-guard-in-collector` ADR, `trading_session` and
  `earnings_date.last_earnings` in the schema pages, `getMarketCalendar` in the Alpaca
  contract, the widened `screener:results` payload, and cross-links from us-66, us-67,
  us-70 and us-97.
- `docs/epics/06-stories/followup-ivr-trading-day-calendar.md` marked resolved — it was
  implemented as that follow-up recommended (a `BrokerProvider` calendar capability),
  not via the plan's offline table. Its optional `PollingScheduler.runNow` cleanup
  remains open.
- Refactor phase written up in `plans/us-98/refactor-phase-results.md`, including four
  logged items of remaining tech debt.
