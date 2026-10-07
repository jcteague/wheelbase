# Research: US-104 — Roll the PMCC short call with net credit/debit preview

Story: Linear [OPT-12](https://linear.app/optionswheel/issue/OPT-12/us-104-roll-the-pmcc-short-call-with-net-creditdebit-preview).
Layout of record: `mockups/epic-09-pmcc-position-detail.mdx` (`rs-entry` … `rs-recorded` presets, the
`RollShortSheet` function); `mockups/us-104-roll-pmcc-short-call.mdx` is design history and agrees
with it on every figure.

## What already exists (verified against `src/` on `main` and on the `wb-103` worktree)

**On `main` (shipped):**

- `rollCc` / `rollCcPosition` / `positions:roll-cc` / `RollCcSheet` + `RollCcForm` + `RollCcSuccess`
  (US-14) — the wheel covered-call roll this story mirrors in shape: linked `ROLL_FROM` (BUY CALL) +
  `ROLL_TO` (SELL CALL) pair sharing a fresh `roll_chain_id`, one new snapshot, position row untouched.
  `RollPayloadBaseSchema` / `RollResultBase` in `src/main/schemas.ts` are the shared payload and result
  shapes (`newStrike` optional, defaults to the current strike server-side; money as `z.number()`).
- `registerParsedPositionHandler` in `src/main/ipc/positions.ts` — the one-line handler helper every
  `positions:*` mutation uses.
- `pmccCrossLegIssues` in `src/main/core/pmcc-rules.ts` — US-101's entry rules, including the
  short-before-long comparator inline: `short.expiration >= long.expiration` →
  `('short.expiration', 'short_not_before_long', 'Short call must expire before the LEAPS call.')`.
  The renderer's `pmcc-entry.ts` schema already calls this pure function, so the engine's message is
  the form's message.
- `PositionDetailActions` renders header actions by `phase` only; a `PMCC_OPEN` position shows no
  action. `usePositionDetailSheets` holds one boolean per roll sheet; `PositionDetailPage` mounts
  `RollCcSheet` from `activeLeg` + `costBasisSnapshot` — both of which are **null for a PMCC**
  (`activeLegSubquery` is wheel-phase-aware by design; US-101 relies on that to keep the wheel-only
  jobs off PMCC rows).
- `FormButton` dims only `isPending`; a `disabled` primary button still renders fully gold with a
  pointer cursor (US-102's open note). Five of this story's scenarios assert a visibly blocked confirm.
- `computeDteFromInput` (`src/renderer/src/lib/format.ts`) — `date-fns` local-calendar DTE for a
  date the trader is typing; `null` while incomplete. `computeDte` there is UTC arithmetic and must not
  be used for new figures.
- `parseInputDecimal` (`src/renderer/src/lib/decimal-input.ts`) — safe `Decimal` from form text.
- `Sheet*`, `Field` (with `hint` and `error`), `NumberInput` (with `prefix`), `DatePicker`,
  `SectionCard`, `SummaryRow`, `AlertBox` (`success | error | warning | info`), `Caption`.
- E2e: `e2e/pmcc-helpers.ts` (`launchPmcc`, `tempDbPath`, `closePmcc`, `positionRows`, `sqlite`,
  `tableCount`), `e2e/helpers.ts` (`reachCcOpenState`, `openDetailFor`, `selectDate`).

**On `wb-103` (US-103, implemented, tasks all checked, not yet merged to `main`):**

- `calculatePmccLedger` (pure) and the service `src/main/services/pmcc-ledger.ts`:
  `appendPmccSnapshot(db, positionId, { triggerEvent, eventDate, now })` — the **one** PMCC snapshot
  writer, called inside the caller's transaction; `pmccLedgerFromLegs(legs)`; `currentLongStrike`;
  `buildPmccContributions` (roll chains net by action: `rollFrom.action === 'SELL'` is a LEAPS roll,
  otherwise a short roll).
- `src/main/services/roll-chains.ts#groupRollChains` (extracted from `assignCspPosition`),
  `src/main/services/leg-rows.ts#readLegs`.
- `PmccTriggerEvent = z.enum([... 'PMCC_SHORT_ROLL' ...])` in `src/main/schemas.ts`; `LegRole` gains
  `SHORT_CALL_CLOSE | SHORT_CALL_EXPIRED | LEAPS_CLOSE | SHORT_CALL_ASSIGNED`; `isPmccLegRole`.
- `GetPositionResult.pmccLedger: PmccLedgerResult | null`; `PmccListSummary` carries
  `basisPerShare` / `basisTotal`.
- `PmccCostBasis` drawer under `PmccLegReference` in `PositionCockpit`'s PMCC branch.
- Dev-only `_test:pmcc-record-leg-event` channel + `e2e/pmcc-ledger-helpers.ts` (`createXyzPmcc`,
  `EXPIRE_1`, `SHORT_2`, `recordEvents`, `openXyzDetail`, `drawer`, `cell`, `snapshots`). Landing
  `EXPIRE_1` then `SHORT_2` on the XYZ fixture produces **exactly this story's Background**: an open
  $108 short sold at $1.80, basis $21.20, effective share cost $101.20.

### Sibling stories (read from Linear)

- **US-102** (Backlog, blocks this story) owns the coverage comparator and its two messages, and
  says "part of this story is extracting that check into the shared comparator both entry and rolls
  call". It also flags the `FormButton` disabled treatment. Neither has started.
- **US-103** (In Progress → implemented on `wb-103`) owns the formula, snapshot and the "one net line
  per roll". This story calls `appendPmccSnapshot` with `'PMCC_SHORT_ROLL'` and computes no basis.
- **US-109** renders the history line ("Short-call roll #1 debit"); **US-114** adds the IV context
  section to this sheet; **US-118** owns the final header-action set; **US-115** adds `Sell Short
Call` for the LEAPS-only state.

## Architecture Decisions

### ADR: US-104 builds on the `wb-103` branch and carries the short-side half of US-102's comparator extraction

- **Decision:** The plan assumes US-103 (`wb-103`) lands first — every main-process area imports
  `appendPmccSnapshot`, `groupRollChains`, `readLegs`, `PmccTriggerEvent` and `pmccLedger` from it.
  Because US-102 has not started and this story cannot ship without the comparator at its service
  boundary, this story extracts the **short-side** comparator from `pmccCrossLegIssues` into two
  exports in `src/main/core/pmcc-rules.ts` — `shortExpiresBeforeLeaps(shortExpiration, longExpiration): boolean`
  and `SHORT_NOT_BEFORE_LONG = { code: 'short_not_before_long', message: 'Short call must expire before the LEAPS call.' }`
  — and makes `pmccCrossLegIssues` call them, so the message exists once. US-102 keeps ownership of the
  message text and of the inverse (`LEAPS call must expire after the short call.`), the US-105 /
  US-115 boundaries, and its own AC; this story does not restate or widen them.
- **Why:** Linear marks US-104 blocked by US-102 and US-103. US-103 is done on a branch; US-102's only
  deliverable this story needs is the shared predicate + message, and US-102 itself says the entry
  check is to be extracted rather than copied. Extracting the half we need is smaller than a second
  inline copy and leaves US-102 less to do, not more.
- **Alternatives considered:** Wait for US-102 to ship — blocks a 5-point story on a 5-point story for
  one function. Copy the comparison inline in `rollPmccShortCall` — the exact drift US-102 exists to
  prevent. Pass `pmccCrossLegIssues` the whole pair — it also runs fill-date, strike-above-long and
  net-debit rules that do not apply to a roll.

### ADR: `rollPmccShortCall` is a new pure lifecycle function with a fixed rule order

- **Decision:** Add to `src/main/core/lifecycle.ts`:

  ```ts
  interface PmccShortCallTerms {
    strike: string
    expiration: string
    fillDate: string
  }
  interface RollPmccShortCallInput<S extends PmccShortCallTerms = PmccShortCallTerms> {
    currentPhase: WheelPhase
    openShort: S | null
    leapsExpiration: string
    fillDate: string // the roll's fill date
    newStrike?: string // omitted = roll out at the current strike
    newExpiration: string
    costToClosePerContract: string
    newPremiumPerContract: string
  }
  interface RollPmccShortCallResult<S extends PmccShortCallTerms = PmccShortCallTerms> {
    phase: 'PMCC_OPEN'
    openShort: S // the caller's own short, now known to exist
    newStrike: string // the current strike when the input omitted it
  }
  ```

  _Revised after implementation and review._ The plan's first draft had `newStrike: string` and a
  result of only `{ phase: 'PMCC_OPEN' }`. The engine now returns the validated open short and
  the resolved strike, so the service does not need a dead `short === null` re-check or a
  `?? 0` fallback after the call. Review B1 added `fillDate` and rule 3.

  Rules, in order, first failure throws `ValidationError(field, code, message)`:

  | #   | Rule                                                                       | field                    | code                          | message                                                                                         |
  | --- | -------------------------------------------------------------------------- | ------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
  | 1   | `currentPhase !== 'PMCC_OPEN'`                                             | `__phase__`              | `invalid_phase`               | `Position is not in PMCC_OPEN phase`                                                            |
  | 2   | `openShort === null`                                                       | `__root__`               | `no_open_short_call`          | `This PMCC has no open short call to roll.`                                                     |
  | 3   | `fillDate < openShort.fillDate`                                            | `fillDate`               | `close_date_before_open`      | `Fill date cannot be before the short call open date`                                           |
  | 3b  | `fillDate > openShort.expiration`                                          | `fillDate`               | `close_date_after_expiration` | `Fill date cannot be after the short call expiration date`                                      |
  | 4   | `costToClosePerContract ≤ 0`                                               | `costToClosePerContract` | `must_be_positive`            | `Cost to close must be greater than zero`                                                       |
  | 5   | `newPremiumPerContract ≤ 0`                                                | `newPremiumPerContract`  | `must_be_positive`            | `Replacement premium must be greater than zero`                                                 |
  | 6   | `newStrike ≤ 0`                                                            | `newStrike`              | `must_be_positive`            | `Strike must be positive`                                                                       |
  | 7   | `!shortExpiresBeforeLeaps(newExpiration, leapsExpiration)`                 | `newExpiration`          | `short_not_before_long`       | `Short call must expire before the LEAPS call.` (US-102's constant)                             |
  | 8   | `newExpiration < openShort.expiration`                                     | `newExpiration`          | `must_be_on_or_after_current` | `Replacement expiration must be on or after the current expiration (Nov 20, 2026)`              |
  | 9   | `newExpiration <= fillDate`                                                | `newExpiration`          | `expiration_not_after_fill`   | `Expiration must be after the fill date.` (`EXPIRATION_NOT_AFTER_FILL`, shared with `openPmcc`) |
  | 10  | `newStrike === openShort.strike && newExpiration === openShort.expiration` | `__roll__`               | `no_change`                   | `Roll must change the strike, the expiration, or both`                                          |

  Rules 3, 3b and 7–10 are reported by the pure `pmccShortRollIssues` in `pmcc-rules.ts` (review fix),
  which the renderer form schema also consumes, so codes and messages have one home; the engine
  throws its first issue, a rule-3 or rule-3b (`fillDate`) issue before the money rules. Rule 3 (review B1) keeps the
  `close_date_before_open` code and `Fill date cannot be before the … open date` wording of
  `requireFillDateOnOrAfterOpen`, the helper `closeCoveredCall` and `recordCallAway` use. It sits
  right after the structural guards because it needs the open short. Without it, a too-early roll
  would sort before the open short in `currentShortCallLeg`'s fill-date replay. The closed short
  would then read as still open, a second roll would close it twice, and the snapshot would get an
  out-of-order `eventDate`. The wheel rolls (`rollCc` / `rollCsp`) have no fill-date rules, so
  there is no roll precedent for "not in the future", and that rule is not added (the e2e
  Background uses future-dated fills).

  Rule 3b (code review) rejects a roll filled after the open short's expiration: a short call
  cannot be bought back once it has expired. It mirrors `closeCoveredCall`'s
  `close_date_after_expiration` rule — same code and comparison (`fillDate > expiration`, so a
  fill on expiration day is allowed) — with the message adapted to the PMCC short call and without
  closeCoveredCall's "— use Record Expiry instead" tail, since there is no PMCC Record Expiry
  action yet. It is a `fillDate` issue, so it is thrown before the money rules, after rule 3.
  With rules 3b and 8 both holding, `fillDate ≤ openShort.expiration ≤ newExpiration`, so rule 9
  can now only fire when all three fall on the same day.

  Rule 9 (review fix) rejects a replacement that is already expired on the roll's own fill date.
  Without it the engine recorded an expired SELL `ROLL_TO` that `currentShortCallLeg` then treats as
  the open short forever. It reuses `openPmcc`'s `expiration_not_after_fill` rule through the
  `EXPIRATION_NOT_AFTER_FILL` constant in `pmcc-rules.ts`, so code and message cannot drift. It runs
  after the coverage and on/after-current rules so those AC messages still win when several date
  rules fail, and before no-change so a same-expiration roll filled on/after that expiration reports
  the expiration. The form schema mirrors it on `newExpiration` once both dates are complete.

  Rule 8's date is formatted with `date-fns` `format(parseISO(d), 'MMM d, yyyy')` (the engine already
  imports `date-fns` in `dte.ts`; no string slicing). ISO dates compare as strings, as everywhere in
  the engine. Strikes compare as `Decimal` equality after the service formats both to 4 dp.

- **Why:** The story's technical note names the function and its two jobs ("validates that the PMCC
  has an open short call and that the replacement is a legal successor"). The order puts the
  structural guards first, then field-level money guards (so a $0.00 cost to close is reported
  beside its field even when the dates are also wrong), then the coverage invariant (safety-critical,
  before the softer date and no-change rules), matching how `rollCc` orders phase → date → no-change →
  money but with coverage promoted. `__roll__` and `must_be_on_or_after_current` reuse `rollCc`'s
  vocabulary so the IPC error-code table gains no synonyms.
- **Alternatives considered:** Extend `rollCc` with a `strategy` flag — different phase, an extra
  nullable leg and a coverage rule; the US-14 ADR chose replicate-not-generalize for less than this.
  Put the comparator in the service — the engine is where every other roll rule lives and where the
  property tests run.

### ADR: The open legs of a PMCC are derived by replaying its legs, and `getPosition` returns them

- **Decision:** `src/main/services/pmcc-ledger.ts` exports two selectors beside `currentLongStrike`:
  `currentLeapsLeg(legs): LegRecord | null` (the existing private `newestLongBuy`, exported) and
  `currentShortCallLeg(legs): LegRecord | null` — a replay over the position's legs in `readLegs`
  order: a `SHORT_CALL_OPEN`, or the `ROLL_TO` of a short-side chain (`rollFrom.action === 'BUY'`),
  opens the short; a `SHORT_CALL_EXPIRED` / `SHORT_CALL_CLOSE` / `SHORT_CALL_ASSIGNED` closes it; a
  chain's `ROLL_FROM` closes the previous short and its `ROLL_TO` opens the next, so the chain's net
  effect is "the open short is now the ROLL_TO". `pmccOpenLegs(legs): PmccOpenLegs | null` combines
  them (`null` when there is no LEAPS leg). `GetPositionResult` gains
  `pmccOpenLegs: PmccOpenLegs | null` (null for a wheel), computed next to `pmccLedger`. `PmccOpenLegs`
  is defined in `pmcc-ledger.ts` and re-exported from `src/main/schemas.ts`; the renderer api
  imports it from there, so no renderer module imports `main/services`.
- **Why:** US-103 changes no phase and US-115 / US-119 (which will introduce `PMCC_LEAPS_ONLY`) have
  not shipped, so "has an open short call" cannot be read from `phase` yet — the US-103 e2e already
  records a `SHORT_CALL_EXPIRED` on a `PMCC_OPEN` position through the test seam, and this story's
  "no open short call" scenario starts from exactly that state. The renderer needs the same answer for
  the header action, the sheet's context and the leg reference, and the ADR
  `server-side-dte-and-derived-fields` puts derived facts in the main process. `activeLegSubquery`
  must **not** learn PMCC phases: US-101 keeps the alert, polling and calendar jobs off PMCC rows
  precisely because it returns no leg for them.
- **Alternatives considered:** Add `PMCC_OPEN → SHORT_CALL_OPEN | ROLL_TO` to `activeLegSubquery` —
  turns on every wheel-only consumer for PMCC rows. Derive in the renderer from `detail.legs` —
  duplicates the chain grouping in the renderer, and the service needs the same selector for rule 2.
  Wait for `PMCC_LEAPS_ONLY` — blocks on US-115 / US-119.

### ADR: `rollPmccShortCallPosition` writes the pair and calls US-103's writer in one transaction

- **Decision:** `src/main/services/roll-pmcc-short-call-position.ts` exports
  `rollPmccShortCallPosition(db, positionId, payload: RollPmccShortCallPayload): RollPmccShortCallResult`.
  Flow: `getPosition` (→ `not_found`), `pmccOpenLegs(detail.legs)` (→ `no_active_leg` when the
  position has no LEAPS leg at all), format money to 4 dp, `newStrike` defaults to the open short's
  strike, call `rollPmccShortCall`, then inside **one** `db.transaction`: insert `ROLL_FROM` (`BUY`
  `CALL`, the open short's strike / expiration / contracts, `premium = fill = costToClose`,
  `fees = '0.0000'`, new `roll_chain_id`), insert `ROLL_TO` (`SELL` `CALL`, replacement strike /
  expiration, same contracts, `premium = fill = newPremium`, same chain), then
  `appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_SHORT_ROLL', eventDate: fillDate, now })`.
  The position row is not touched (phase stays `PMCC_OPEN`). Returns `RollResultBase` plus
  `position: { id, ticker, phase: 'PMCC_OPEN', status: 'ACTIVE' }`, the snapshot narrowed to
  `triggerEvent: 'PMCC_SHORT_ROLL'`, `ledger: PmccLedgerResult` (the writer's return) and
  `shortCallRollNumber` (short-side chains before this roll + 1).
- **Why:** This is US-14's shape with US-103's writer in place of `calculateRollBasis`; the story
  says "the service triggers the US-103 recalculation … and lets US-103 own the formula, the snapshot,
  and the single net history row. This story must not compute a basis of its own." Returning the
  ledger lets the success state show the post-roll figures without a refetch, and the roll number
  lets the confirmation banner name the ledger line that US-109 will later render. A failed snapshot
  write rolls the two legs back with it — the US-103 "failed leg event" guarantee, inherited.
- **Alternatives considered:** Record fees on the roll legs — no fees field in the AC or the
  mockup's `Replacement short call` section; the wheel rolls also write `'0.0000'`. Left out
  deliberately; the ledger already sums `fees` per leg, so adding a field later is additive.

### ADR: Payload reuses `RollPayloadBaseSchema`; money crosses the IPC as numbers

- **Decision:** `RollPmccShortCallPayloadSchema = RollPayloadBaseSchema` (`positionId`,
  `costToClosePerContract`, `newPremiumPerContract`, `newExpiration`, `newStrike?`, `fillDate?`),
  exactly as `RollCspPayloadSchema` and `RollCcPayloadSchema` are. The service formats to 4-dp
  strings before the engine and the inserts.
- **Why:** The story's note says "money as strings at 4 dp", but every shipped roll channel — and
  US-101's `positions:create-pmcc` — takes `z.number()` and formats in the service. One wire
  convention per channel family beats a one-off; the 4-dp rule is honoured where it matters (engine
  inputs, rows, results). Noted here so the deviation is deliberate.
- **Alternatives considered:** A string-money schema for this channel only — a second convention
  for the renderer adapter to remember, with no new guarantee.

### ADR: The sheet is the mockup's `RollShortSheet`; the effective-share-cost warning is renderer-side and advisory

- **Decision:** `RollPmccShortCallSheet` (portal, `SheetPanel width={440}`, `role="dialog"
aria-label="Roll Short Call"`, Escape / scrim / Cancel close without recording) owns a React Hook
  Form instance (`mode: 'onChange'`, `zodResolver(rollPmccShortCallSchema(ctx))`) and renders
  `RollPmccShortCallForm`, whose sections follow the mockup top to bottom: **Coverage**
  (`PmccCoverageRuler`: today, current short, replacement, LEAPS on one axis; red when the
  replacement is blocked), **Current short call** (Contract, Expiration with DTE, Sold at, `LEAPS ·
read-only`, `Effective share cost` highlighted, the "not a guaranteed breakeven" note),
  **Replacement short call** (Cost to close, Premium, Strike, Expiration with a `N DTE` hint, Fill
  date defaulting to today), the **Net** card or its dashed placeholder (`Enter a cost to close and a
premium to preview the net.`), the advisory warning, the no-change error, and a footer with the
  blocked note, Cancel / `Confirm roll` and `Your draft is kept until the roll is valid. No order is
placed.` All live figures come from `useWatch` through pure helpers in
  `src/renderer/src/lib/pmcc-roll.ts`: net per share and total, the roll label, post-roll basis and
  effective share cost (`leapsStrike + (basis − net)`), and the shortfall `effectiveAfter − newStrike`
  when positive. The warning is `AlertBox variant="warning"` with the AC's sentence and never
  disables confirm. `Confirm roll` is `disabled={!formState.isValid}`.
- **Why:** The consolidated mockup is the layout of record and names every region this story owns
  (coverage ruler, net preview, roll label, warning). The story's note: "compare the replacement
  strike against the post-roll effective share cost … Advisory only — never blocks confirm", and the
  `soft-client-side-warnings` ADR. `mode: 'onChange'` is what makes "the confirm action is disabled"
  true while the trader is still typing, which five scenarios assert.
- **Alternatives considered:** Reuse `RollCcForm` with props — its "below cost basis" warning compares
  a share basis, its label format differs, and it has no coverage context; US-104 says the wheel path
  must be untouched. Keep confirm enabled and validate on submit like US-101 — contradicts the AC.

### ADR: The net preview and the roll label are rendered as the AC's exact strings

- **Decision:** The net card renders one element (`data-testid="pmcc-roll-net"`) whose text is
  `Net Debit: $0.60 per share ($60.00 total)` / `Net Credit: $1.20 per share ($120.00 total)` — amount
  in `text-wb-red` for a debit and `text-wb-green` for a credit, per the mockup. The label element
  (`data-testid="pmcc-roll-label"`) renders `pmccRollLabel(...)`: `Roll Up & Out: $108 to $112
strike, Nov to Dec expiration`, `Roll Out: same $108 strike, Nov to Dec expiration`, `Roll Up: $108
to $112 strike, same Nov expiration`, `Roll Down & Out`, `Roll Down`; strikes print via
  `Decimal.toString()` (no trailing `.00`); months via `date-fns` `format(parseISO(d), 'MMM')`, and
  when both expirations fall in the same month but differ, the day is added (`Nov 20 to Nov 27`).
  The replacement's DTE (`42 DTE`) is `computeDteFromInput(newExpiration)` shown both as the
  expiration field's hint and after the label.
- **Why:** The AC quotes these strings verbatim; the wheel's `getCcRollTypeDetail` prints `$185 →
$190 strike, Apr 18 → May 16 expiration`, a different shape, so a new helper beside it is the
  honest move (and leaves US-14 untouched). Same-month handling is the one case the mockup's
  month-only rule mislabels.
- **Alternatives considered:** Reuse `getCcRollTypeLabel` + `getCcRollTypeDetail` — wrong text.

### ADR: Success closes the sheet and the detail page shows a confirmation banner that names the ledger line

- **Decision:** On success the sheet calls `onRecorded(result)`; `usePositionDetailSheets` closes
  it and holds the result; `PositionDetailPage` renders `AlertBox variant="success"
data-testid="pmcc-roll-recorded-banner"` above the cockpit: `Rolled — bought to close XYZ $108.00
CALL <exp> at $3.00, sold XYZ $112.00 CALL <exp> at $2.40. Short-call roll #1 debit · $0.60 per
share ($60.00 total). Both legs share one roll chain.` The banner is dismissed when the sheet is
  opened again or the page is left. TanStack invalidation refetches the detail, so the `Cost basis`
  drawer reads $21.80 and the `Leg reference` shows the $112 short.
- **Why:** The mockup's `rs-recorded` preset: "the page carries the confirmation banner", not a
  success panel inside the sheet. The AC's "the history shows one line 'Short-call roll #1 debit' of
  $0.60 per share" names a line US-109 will render in the timeline; until then the banner is the one
  place the recorded net line is shown to the trader, and it is backed by the data US-109 will read
  (one `PMCC_SHORT_ROLL` snapshot, one chain). The e2e asserts both the banner text and the data.
- **Alternatives considered:** A `RollPmccShortCallSuccess` panel like `RollCcSuccess` — not the
  mockup. Render a history table now — US-103 and US-109 both say history rendering is US-109's.

### ADR: One header action and one `FormButton` fix, no more

- **Decision:** `PositionDetailActions` gains `strategyType` and `hasOpenShortCall` props and
  renders `Roll Short Call →` (`data-testid="roll-pmcc-short-btn"`) only when
  `strategyType === 'PMCC' && hasOpenShortCall`. Nothing else about the PMCC header changes (US-118
  owns the final set; US-115 adds `Sell Short Call`). `FormButton` gains a visible disabled
  treatment — `disabled:opacity-40 disabled:cursor-not-allowed` Tailwind variants and
  `cursor-not-allowed` whenever `disabled || isPending` — so a blocked confirm reads as blocked
  everywhere (the existing wheel sheets' disabled confirms inherit it; US-102 asked for exactly this).
- **Why:** The sheet needs an entry point and the AC needs a visibly disabled confirm; both are the
  minimum. The `leaps-only` preset shows no `Roll Short Call`, which is this story's "no open short
  call" scenario at the UI level.
- **Alternatives considered:** Build the two-lane header now — US-118. Carry a disabled style inside
  this sheet only — leaves the wheel's `No Change` confirm looking enabled, which US-102 flags as a
  defect.

### ADR: `PmccLegReference` shows the open legs, not the opening legs

- **Decision:** `PmccLegReference` takes `openLegs: PmccOpenLegs` (plus `initialNetDebit`) and
  renders the LEAPS card from `openLegs.long` and the short card from `openLegs.short`, keeping the
  US-101 headers `Buy LEAPS call` / `Sell short call` as fixed per-side headers (they were leg-role
  labels; a `ROLL_TO`'s role label is `Roll`). When `openLegs.short` is null the short card is
  omitted (US-115's "no short call open" copy is theirs).
- **Why:** AC: "the PMCC still shows one open LEAPS and one open short call" after the roll — today
  the component finds `SHORT_CALL_OPEN` by role and would keep showing the $108 call.
- **Alternatives considered:** Leave it to US-118 — the AC would fail at e2e.

### ADR: E2e reaches the Background through US-103's seam and drives the roll through the UI

- **Decision:** `e2e/pmcc-short-call-roll.spec.ts` launches with `NODE_ENV: 'test'`, calls
  `createXyzPmcc` then `recordEvents([EXPIRE_1(), SHORT_2()])` (both from `pmcc-ledger-helpers.ts`),
  opens the detail, and uses the real `Roll Short Call →` button and sheet for every UI scenario.
  Dates are run-day-relative (`localDate(67)` current short, `localDate(368)` LEAPS, `localDate(95)`
  replacement, `localDate(60)` for "rolls in"); money is the AC's. Expected DTE and month labels are
  computed in the spec from the same `localDate` values with `date-fns`. The bypass assertions
  ("no ROLL_FROM or ROLL_TO leg is recorded", "no open short call") call
  `window.api.rollPmccShortCall` directly and read `tableCount(dbPath, 'legs')` and `getPosition`.
- **Why:** The seam exists for exactly this ("land post-entry events before the stories that record
  them exist"), and `EXPIRE_1 + SHORT_2` is the AC Background to the cent. Driving the roll itself
  through the UI is what makes the e2e falsifiable for the form rules.
- **Alternatives considered:** Seed the short via SQL — bypasses the snapshot chain the "one net line"
  assertion reads.

### ADR: Logging

- **Decision:** Service: DEBUG `roll_pmcc_short_call_inputs { positionId, fillDate, newStrike, newExpiration }`,
  `roll_pmcc_short_call_tx_start` / `_tx_committed { positionId, rollChainId }`; INFO
  `pmcc_short_call_rolled { positionId, rollChainId, netCreditPerShare, basisPerShare, shortCallRollNumber }`;
  INFO `pmcc_short_roll_rejected { positionId, field, code }` on `ValidationError`.
  `appendPmccSnapshot` keeps its own INFO. Nothing in `core/`.
- **Why:** CLAUDE.md logging standards; mirrors `cc_rolled` and US-101's `pmcc_entry_rejected`.

## Worked figures (the AC's XYZ Background, 1 contract, $0 fees)

| Scenario        | cost | strike | premium | net / share  | total   | basis after | eff. after | label                                                       |
| --------------- | ---- | ------ | ------- | ------------ | ------- | ----------- | ---------- | ----------------------------------------------------------- |
| up & out        | 3.00 | 112    | 2.40    | −0.60 debit  | $60.00  | 21.80       | 101.80     | `Roll Up & Out: $108 to $112 strike, Nov to Dec expiration` |
| out (credit)    | 1.10 | 108    | 2.30    | +1.20 credit | $120.00 | 20.00       | 100.00     | `Roll Out: same $108 strike, Nov to Dec expiration`         |
| below eff. cost | 3.00 | 98     | 2.50    | −0.50 debit  | $50.00  | 21.70       | 101.70     | warning: shortfall $3.70                                    |

`effective after = 80 + (21.20 − net)`. After the up-and-out roll is recorded the ledger reads
$21.80 / $2,180.00 and the chain has four snapshots: `PMCC_OPEN`, `PMCC_SHORT_EXPIRED`,
`PMCC_SHORT_OPEN`, `PMCC_SHORT_ROLL`.

## Open Questions

None blocking. Two assumptions are stated above rather than asked:

- **US-102 extraction (short side) is carried here** because Linear blocks US-104 on US-102 and US-102
  is unstarted; US-102 keeps the message, the inverse rule and the other boundaries. If US-102 lands
  first, Area 1 collapses to "import the shared comparator".
- **No fees input on the roll** — the AC and mockup have none; roll legs write `fees = '0.0000'` like
  the wheel's. Flagged in the plan's out-of-scope list.
