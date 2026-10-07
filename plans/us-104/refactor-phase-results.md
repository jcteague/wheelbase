## Area 1 — Shared coverage comparator (Refactor)

- **`issueIf` takes a `{ code, message }` rule** (`src/main/core/pmcc-rules.ts`): signature `(broken, field, rule: PmccRule)` with private `type PmccRule = Pick<PmccIssue, 'code' | 'message'>`; all seven rules changed together; the coverage rule passes `SHORT_NOT_BEFORE_LONG` straight through, and the constant is `satisfies PmccRule`
- Cross-codebase duplication: the `short_not_before_long` code/message now exists only in `pmcc-rules.ts`
- code-simplifier agent: ran, made no changes
- `pnpm test src/main/core`: 798/798 pass; eslint clean on `pmcc-rules*.ts`

## Area 4 — Payload schema and result type

- code-simplifier agent run: passed. Files: `src/main/schemas.ts` (roll region), `src/main/schemas.pmcc.test.ts`.
- **Derive hand-duplicated type**: `RollResultBase<Phase extends WheelPhase>` now owns `position: { id; ticker; phase: Phase; status: 'ACTIVE' }`, which was written out by hand three times. `RollCspResult = RollResultBase<'CSP_OPEN'>`, `RollCcResult = RollResultBase<'CC_OPEN'>`, `RollPmccShortCallResult extends RollResultBase<'PMCC_OPEN'>` (it adds only the narrowed snapshot, `ledger`, and `shortCallRollNumber`). Exported names are unchanged for consumers (roll-csp/roll-cc services, preload `index.d.ts`).
- Manual: removed the `= WheelPhase` default on the type parameter because nothing used it. The type test asserts `toExtend<RollResultBase<'PMCC_OPEN'>>()`, which also checks the phase.
- Checks: `pnpm vitest run src/main/schemas src/main/services/roll-c*` → 134 passed; `pnpm typecheck` clean; `pnpm lint` clean; prettier clean. Full `pnpm test` baseline before refactor: 3972/3973, and the one failure (`PmccEntryForm` net-credit submit) passes in isolation (flaky under load, not related to Area 4).

## Area 3 — `src/main/services/pmcc-ledger.ts`

- **Extracted `orderedLedgerEvents(legs, chains): LedgerEvent[]`** — non-roll legs merged with roll
  chains in fill-then-created order. `LedgerEvent = { leg; chain?: never } | { chain; leg?: never }`
  so callers destructure without `'chain' in` checks.
  - `contributionsFrom` → `orderedLedgerEvents(...).flatMap(eventContribution)`
  - `currentLeapsLeg` → `reduce(applyLeapsEvent, null)` (was a separate filter + sort + `at(-1)`)
  - `currentShortCallLeg` → `reduce(applyShortCallEvent, null)` (dropped its own merge/sort and
    the `ShortCallEvent` type)
  - `SHORT_CALL_CLOSING_ROLES` typed `ReadonlySet<LegRole>` instead of `ReadonlySet<string>`
- code-simplifier pass: split the `PmccOpenLegs` / `pmccOpenLegs` doc comments (the type is never
  null; only the function returns null). No code changes.
- Gates: `pnpm test` 3973/3973 pass; `pnpm lint` clean; `pnpm typecheck` only reports Area 2's
  in-progress Red (`rollPmccShortCall` / `RollPmccShortCallInput` missing from `core/lifecycle`).

## Area 7 — Renderer pure helpers and the form schema (Refactor)

- code-simplifier agent run: passed. Files processed: `lib/pmcc-roll.ts`, `schemas/roll-pmcc-short-call.ts`, `schemas/common.ts`, `schemas/pmcc-entry.ts`. Changed only `pmcc-roll.ts`: nested ternary in `rollKind` → private `verticalKind` if/return; `pmccRollLabel` builds named `kind` / `strike` / `expiration` parts.
- Manual 1 — **Remove duplication**: `moneySchema` was private in `pmcc-entry.ts` and duplicated in the roll schema → exported from `schemas/common.ts`, imported by both. `required` stayed in `pmcc-entry.ts` (the roll schema does not need it).
- Manual 2 — **Remove duplication**: identical private `toNumber` in both schemas → `inputToNumber` in `schemas/common.ts`.
- Manual 3 — **Date handling**: the earlier-than-current check now uses `isBefore(parseISO(...))` instead of ISO string comparison (CLAUDE.md § Date Handling); `pmccRollLabel` uses `isSameMonth`, not `slice`.
- Type review: no change — `RollPmccShortCallFormValues` is `z.infer` (incl. `__roll__`), payload output is the main `RollPmccShortCallPayload`, no casts.
- `pnpm test` → 266 files / 4035 tests passed; `pnpm lint` clean; `pnpm typecheck` clean.
- Remaining: Area 6 re-points `toRollPmccShortCallPayload`'s return type at the renderer `RollPmccShortCallPayload`.

## Area 2 — Pure lifecycle rule set `rollPmccShortCall` (Refactor)

- code-simplifier agent: ran; one change — rule 7's `format(parseISO(…), 'MMM d, yyyy')` hoisted into a local `currentExpiration` before the throw (message byte-identical)
- **`requireRollChanges` not extracted**: sharing it with `rollCc` would need both messages parameterised (`rollCc` says `New expiration must be on or after the current expiration` / `Roll must change at least one of strike or expiration`) and would change `rollCc`'s strike comparison from string equality to `Decimal.eq` (`'185'` vs `'185.00'` would start reporting `no_change`) — a behaviour change, not a refactor. Two short inline guards read clearer than a four-argument helper
- Types: `openShort: { strike; expiration } | null` already makes "no open short" explicit; no casts or duplicated types to derive
- Property stress: the four `rollPmccShortCall` properties (phase-guard reject/accept, coverage guard, valid-input invariant) at `numRuns: 500`, `endOnFailure: true`, seeds 1 / 42 / 1337 / 20261005 / 987654 — all pass; scratch setup + config removed
- `pnpm test src/main/core`: 818/818; `pnpm lint` clean; `pnpm typecheck` clean; prettier clean on the four touched files

## Area 5 — `rollPmccShortCallPosition` service (Refactor)

- code-simplifier agent: ran on the service and its test. In the service, `createdAt` / `updatedAt` moved into the shared leg fields, the insert reads every value from the leg record, and `c` was renamed to `chain`. It left the test unchanged. Tests passed afterwards.
- Manual 1, **`insertLegRow(db, leg: LegRecord)` in `leg-rows.ts`**: one full-column INSERT built from `LEG_COLUMNS`, the inverse of `readLegs`' mapping. It is TDD'd in `leg-rows.test.ts` (a round-trip with every column set to a non-default value). It is now used by:
  - `roll-pmcc-short-call-position.ts`. Its private `INSERT_ROLL_LEG_SQL` is gone and the transaction is two `insertLegRow` calls.
  - `test-fixtures/pmcc-legs.ts#insertLegs`. Its `INSERT_LEG_SQL` is gone.
  - `ipc/test-pmcc-ledger.ts`, the US-103 seam. `INSERT_LEG_SQL` and the positional `insertLegRow` are replaced by `toLegRecord(positionId, leg, now)` followed by the shared insert.
  - `create-pmcc-position.ts#insertPmccLeg`. This was a mechanical change: it now builds the `PmccLegRecord<R>`, inserts it, and returns it, and its `INSERT_LEG_SQL` is gone.
  - The wheel roll and open services were left alone. Their SQL hard-codes literals and they do not build a `LegRecord` first.
- Manual 2, **test helpers deduplicated**: `openPayload` and `recordLegEvent` appeared in both `pmcc-cost-basis-chain.test.ts` and the new test. They moved to `test-fixtures/pmcc-legs.ts` as `pmccOpenPayload(day)` and `recordPmccLegEvent(db, positionId, legs, triggerEvent: PmccTriggerEvent)`.
- Types: the service has no casts. The legs are annotated `RollPmccShortCallResult['rollFromLeg' | 'rollToLeg']` instead of using `as const`. _(Superseded later.)_ At this point a `short === null` throw after the engine call narrowed the type for the inserts, and a never-read `?? 0` strike fallback remained. Both are gone now. The engine is generic over the caller's short leg and returns `{ phase, openShort, newStrike }`, and the service reads the validated short and resolved strike from that result. See data-model.md § 4.
- Not changed:
  - `money4` now exists twice, in `create-pmcc-position.ts` and the new service. Two private one-liners did not justify a shared module.
  - `countRows`-style `.get() as { n: number }` casts in service tests are an existing pattern across files.
- `pnpm test` → 267 files / 4057 passed. `pnpm lint` and `pnpm typecheck` are clean, and prettier was applied to the touched files.

## Area 6 — IPC handler, preload, renderer adapter and hook (Refactor)

- code-simplifier agent: ran on the handler, preload, d.ts, adapter, hook and both new describes. It changed nothing because the code already mirrors the `rollCc` trio line for line.
- Manual: the new `positions:roll-pmcc-short` describe added a second copy of the `create-pmcc` describe's local `registerAndGetHandler`. Both now delegate to a file-level `registerAndGetChannelHandler(channel, db, deps?)` (plus an `IpcHandler` alias) in `ipc/positions.test.ts`.
- Not changed (wider, pre-existing):
  - `api/positions.ts` has 13 adapters with the same `if (!result.ok) throwMappedIpcErrors(result.errors); return result` body. A generic `unwrapIpc` would remove it, but that is outside Area 6's scope.
  - Older `ipc/positions.test.ts` cases inline the import → register → `getRegisteredHandler` steps and could use the new helper.
  - Each `api/positions.test.ts` describe repeats the `Object.assign(window, { api: … })` stub.
- `pnpm test` → 267 files / 4065 passed; `pnpm lint` clean; `pnpm typecheck` clean.

## Area 9 — `Roll Short Call` sheet, coverage ruler, sheet state, page wiring, banner, leg reference (Refactor)

- Baseline: `pnpm test` → 270 files / 4116 passed before any change.
- `code-simplifier` subagent (dispatched from this Area 9 agent) on the new components, hook and page additions: named the ruler's `Replacement` shape; named `PmccRollRecordedBannerProps`. Nothing else changed.
- Manual:
  1. **`applyIpcFieldErrors(error, setError, { target, saveMessage })`** — new `src/renderer/src/lib/ipc-field-errors.ts` (+ 4-case test). `RollPmccShortCallSheet#showRollErrors` and `PmccEntryForm#showSaveErrors` were the same routing with different maps; both now call the helper. `PmccEntryForm.errorTarget` returns `FormPath | null` (`null` = save alert) instead of a `'save'` sentinel; the sheet's map is `Partial<Record<string, FieldPath<…>>>` + `?? null`. The 400-`detail` cast now lives once for these two forms (the other forms' own copies are untouched — out of scope).
  2. **Split `RollPmccShortCallForm`** (279 → 193 lines): the `Replacement short call` field grid and its `deps: '__roll__'` re-check moved to `RollPmccShortCallFields.tsx` (reads the form from context; props `contracts`, `replacementDte`).
- Considered, not done: folding the three roll booleans into one `openSheet` union (would touch the wheel `RollCsp`/`RollCc` state the story says to leave); a shared `useRollSheetForm` across the roll sheets (`RollCcSheet`/`RollCspSheet` are off-limits in this story and differ in schema/success handling); the schema is built in both `useRollPmccShortCallForm` and the form's confirm gate — kept, the gate must not use RHF `isValid`.
- Final: `pnpm test` → 271 files / 4120 passed; `pnpm lint` clean; `pnpm typecheck` clean.
- Remaining tech debt: the `DatePicker`-as-`<input>` test mock is copied into both new test files (it is copied across many existing tests too); other forms (`NewWheelForm`, `CloseCcEarlySheet`, `OpenCoveredCallSheet`, `WatchlistEntryForm`, `ScreeningCriteriaForm`) still hand-roll the 400-`detail` extraction and could adopt `applyIpcFieldErrors`.

## Area 10 — E2E tests (Refactor)

- Baseline: full `pnpm test:e2e` → 40 files / 455 passed, 1 todo.
- `code-simplifier` subagent on the two new files: `confirmDisabled` became a `function` declaration (matching `launch` / `backgroundSheet`); the CC-regression test builds the `roll-cc-btn` locator once. Helpers unchanged.
- Considered, not done: folding `pmcc-roll-helpers.ts` into `pmcc-ledger-helpers.ts` — the file is more than selectors (Background reach functions, the roll date constants, `fillRoll`, `dteOf` / `longDate` / `expirationSpan`, IPC wrappers), so it stays its own module and the US-103 helpers stay unchanged. `positionDetail` overlaps `pmcc-ledger-helpers#snapshots` (both unwrap `getPosition`); left alone because the plan keeps existing helpers unchanged — `snapshots` could be rewritten over `positionDetail` later.
- Final: `pmcc-short-call-roll.spec.ts` → 12 passed after the simplifier; `pnpm rebuild:node`; `pnpm lint` clean; `pnpm typecheck` clean (it does not cover `e2e/`; an ad-hoc strict `tsc` over the new spec + preload types is clean); prettier clean.
