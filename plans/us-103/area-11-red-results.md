# US-103 Area 11 — E2E Red results

Story: Linear OPT-9 (US-103). Plan: `plans/us-103/plan.md` § 11, `plans/us-103/tasks.md` Area 11.

## Files

- `/Users/johnteague/my-stuff/wb-103/e2e/pmcc-ledger-helpers.ts` (new)
- `/Users/johnteague/my-stuff/wb-103/e2e/pmcc-cost-basis.spec.ts` (new)

## Helper API (`e2e/pmcc-ledger-helpers.ts`)

- `createXyzPmcc(page, { contracts?, fees? }) → Promise<positionId>` — `window.api.createPmccPosition` with `pmccFixture(localToday())` values; throws on `{ ok: false }`.
- `EXPIRE_1()`, `SHORT_2()`, `SHORT_ROLL()`, `LEAPS_ROLL()`, `CYCLES()` → `{ triggerEvent, eventDate, legs }`, mirroring `src/main/services/test-fixtures/pmcc-legs.ts` with `localDate(n)` offsets (data-model § 5). They are functions, so dates are computed per run.
- `recordEvent(page, id, event)` → IPC envelope from `window.api.testPmccRecordLegEvent`; `recordEvents(page, id, events)` records in order and throws on any rejection.
- `drawer(page) → { button, content }` — button filtered by `/Cost basis\s*6 fields$/` (the `▼` arrow precedes the title, so no `^`; `Cost basis & history 3 fields` cannot match); content = following sibling `div`.
- `cell(page, label)` — value text of the stat whose label span is exactly `label`, scoped to the drawer content.
- `snapshots(page, id)` — `window.api.getPosition(id).allSnapshots`.
- `openXyzDetail(page)` — `page.reload()` + `openDetailFor(page, 'XYZ')` + wait for the drawer.

## Results — `pnpm test:e2e e2e/pmcc-cost-basis.spec.ts`: 13/13 pass

The implementation already exists (Areas 1–10 Green), so this is the "tests pass immediately" case; the purpose is AC coverage.

| `it`                                                                      | Result                         |
| ------------------------------------------------------------------------- | ------------------------------ |
| Cost basis after the two opening legs                                     | PASS                           |
| The open short-call credit is cash in the ledger, not profit              | PASS                           |
| A short call that expires worthless does not move cost basis              | PASS                           |
| A subsequent short call lowers cost basis                                 | PASS                           |
| A short-call roll contributes one net amount, not two gross amounts       | PASS                           |
| A LEAPS roll applies its net cash and re-anchors the effective share cost | PASS                           |
| Credits that exceed the LEAPS cost give a negative basis                  | PASS                           |
| Cost basis is per share of contract regardless of quantity                | PASS                           |
| Fees are counted once, in the leg that incurred them                      | PASS                           |
| The audit chain records one snapshot per leg event                        | PASS                           |
| A failed leg event leaves no cost-basis change                            | PASS (after a test fix, below) |
| The positions list shows the running cost basis                           | PASS                           |
| Leave a classic wheel unaffected                                          | PASS                           |

### Test bug fixed: failure injection for "A failed leg event…"

The first run used `chmod 0o444` on the DB (+ `-wal`/`-shm`) as planned. It returned `{ ok: true }`: the
main process already holds the SQLite file descriptors open read-write, so a permission change after open
cannot fail a write. Replaced with a `BEFORE INSERT ON cost_basis_snapshots … RAISE(ABORT)` trigger
created through the `sqlite3` CLI. This is a stronger test: the leg row inserts first, then the snapshot write
aborts, so `legs === 2` and `snapshots === 1` prove the transaction rolled back. The plan/quickstart
`chmod` knob is wrong and should be updated to this mechanism.

## Sibling specs — `e2e/open-pmcc-position.spec.ts`, `e2e/position-cockpit.spec.ts`: 72/73 pass

- FAIL `open-pmcc-position.spec.ts:400` — `selecting Record PMCC closes the panel and one PMCC position appears with status "LEAPS + short call open" and initial net debit $2,300.00`:
  `expected 'XYZPMCCACTIVELEAPS + short call open—…' to contain '$2,300.00 net debit'` (line 419).
  **Classification: stale US-101 assertion, not a product defect.** US-103 intentionally drops the ` net debit`
  suffix from the list row (plan § 10, quickstart "no `net debit` suffix", AC-12). The plan missed this e2e
  assertion (as it missed a Vitest fixture in Area 10). Green should change line 419 to assert `$2,300.00`
  is present and `net debit` is absent (the row's value at open is the same $2,300.00). The `it` name mirrors
  the US-101 AC wording, so whether to rename it or amend OPT-7 is a story-owner decision.
- `position-cockpit.spec.ts`: all pass.

## Notes

- No property tests: e2e area. No property applies.
- AC-13 also opens the wheel's `Cost basis & history` drawer and asserts `$46.50`. This proves the
  negative assertions are not vacuous, and that `drawer(page).button` matches nothing on a wheel.
