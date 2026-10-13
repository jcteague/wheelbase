# Research: US-105 — Roll the PMCC LEAPS to a further expiration when DTE is low

Story: Linear [OPT-13](https://linear.app/optionswheel/issue/OPT-13/us-105-roll-the-pmcc-leaps-to-a-further-expiration-when-dte-is-low).
Layout of record: `mockups/epic-09-pmcc-position-detail.mdx` (`rl-entry` … `rl-no-short` presets, the
`RollLeapsSheet` function). `mockups/us-105-roll-pmcc-leaps.mdx` is design history; it agrees with the
consolidated sheet on every region and, unlike the consolidated file, on every **figure** in the Linear
AC (the consolidated mockup runs the same sheet on a different XYZ ledger — basis $11.00, effective
$91.00, a $48.00 "too much time" debit). Per CLAUDE.md, Linear wins on figures; the consolidated file
wins on layout.

## What already exists (verified against `src/` on `main` and on the `wb-103` worktree)

**On `main` (shipped):**

- `rollCc` / `rollCcPosition` / `positions:roll-cc` / `RollCcSheet` (US-14) — the wheel's roll-pair
  precedent: linked `ROLL_FROM` + `ROLL_TO` sharing a fresh `roll_chain_id`, one snapshot, position row
  untouched. `RollPayloadBaseSchema` / `RollResultBase` in `src/main/schemas.ts` hard-code
  `rollFromLeg.action: 'BUY'` / `rollToLeg.action: 'SELL'` — the **inverse** of a LEAPS roll.
- `pmccCrossLegIssues` in `src/main/core/pmcc-rules.ts` — US-101's entry rules, with the
  strike-ordering check inline: `new Decimal(short.strike).lte(long.strike)` →
  `('short.strike', 'strike_not_above_long', 'Short-call strike must be above the LEAPS strike.')`.
  No extracted strike predicate exists yet (the story says to reuse one if US-101 had extracted it).
- `requirePositiveDecimal(value, field, label)` and `requirePositiveStrike(strike, field)` in
  `lifecycle.ts`; `ValidationError(field, code, message)`.
- `computeDteFromInput` (`src/renderer/src/lib/format.ts`) — `date-fns` local-calendar DTE, `null`
  while the date is incomplete. `fmtMoneyGrouped`, `parseInputDecimal`.
- `Sheet*`, `Field` (`hint`, `error`), `NumberInput` (`prefix`), `DatePicker`, `SectionCard`,
  `SummaryRow`, `AlertBox` (`success | error | warning | info`), `FormButton`.
- `LEG_ROLE_LABEL` gives a `ROLL_TO` the label `Roll`; `PmccLegReference` currently finds legs by
  `LEAPS_OPEN` / `SHORT_CALL_OPEN` role (US-104 changes it to render `pmccOpenLegs`).

**On `wb-103` (US-103, implemented, all tasks checked, not yet merged):**

- `calculatePmccLedger` (pure) and `src/main/services/pmcc-ledger.ts`: `appendPmccSnapshot` (the one
  PMCC snapshot writer, called inside the caller's transaction), `pmccLedgerFromLegs`,
  `currentLongStrike`, private `newestLongBuy` — which already picks the `ROLL_TO` of a chain whose
  `ROLL_FROM` is a SELL, i.e. **the effective-share-cost re-anchoring this story displays is already
  implemented** (ADR `pmcc-effective-share-cost-anchors-on-newest-long-buy`). `isLeapsRoll(chain)` =
  `chain.rollFrom.action === 'SELL'`; a LEAPS roll contributes one `LONG` net (ADR
  `pmcc-contributions-by-role-and-action`). **No strike-delta term exists anywhere**, so the story's
  "must not apply a strike-delta term" holds by construction.
- `PmccTriggerEvent` already includes `'PMCC_LEAPS_ROLL'`. `groupRollChains` nets by action
  (`Σ SELL − Σ BUY`), so a LEAPS roll's `netCreditPerShare` is `26.00 − 23.50 = +2.5000` with no caller
  flag (ADR `shared-roll-chain-helper`).
- `GetPositionResult.pmccLedger: PmccLedgerResult | null` carries `leapsCostPerShare` — the AC's
  "LEAPS cost to date" — and `effectiveShareCost`.
- Fixtures: `src/main/services/test-fixtures/pmcc-legs.ts` has `OPEN`, `EXPIRE_1`, `SHORT_2`,
  `SHORT_ROLL` and **`LEAPS_ROLL`** (`ROLL_FROM` SELL $80 @ 26.00 + `ROLL_TO` BUY $85 @ 23.50, exp
  `day(494)`, chain `rc-2`). `e2e/pmcc-ledger-helpers.ts` has the same five as run-day-relative events
  plus `createXyzPmcc`, `recordEvents`, `openXyzDetail`, `drawer`, `cell`, `snapshots`. The US-103 e2e
  already proves `OPEN → EXPIRE_1 → SHORT_2 → SHORT_ROLL → LEAPS_ROLL` reads
  `$19.30 / $1,930.00 / LEAPS cost to date $22.50 / effective $104.30` with five snapshots ending
  `PMCC_LEAPS_ROLL`.
- **`OPEN + EXPIRE_1 + SHORT_2 + SHORT_ROLL` is this story's Background to the cent**: the open short
  is the `ROLL_TO` **$112.00 sold at $2.40**, basis **$21.80**, LEAPS bought at **$25.00**, effective
  share cost **$101.80**. Only the calendar differs (run-day-relative `localDate(n)` instead of
  2027-07-09), exactly as US-103 and US-104 handle it.
- Dev-only `_test:pmcc-record-leg-event` channel (NODE_ENV=test) for landing post-entry events.

**Planned on `plans/us-104/` (US-104, not yet implemented — sibling roll, shares this sheet's parts):**

- Area 1: `shortExpiresBeforeLeaps(short, long)` + `SHORT_NOT_BEFORE_LONG` extracted into
  `pmcc-rules.ts` (the short-side half of US-102).
- Area 3: `currentLeapsLeg`, `currentShortCallLeg`, `pmccOpenLegs(legs): PmccOpenLegs | null` in
  `pmcc-ledger.ts`; `GetPositionResult.pmccOpenLegs`.
- Area 7: `src/renderer/src/lib/pmcc-roll.ts` — `pmccRollNet`, `pmccRollLabel`,
  `pmccPostRollEffectiveCost`, `pmccStrikeShortfall`.
- Area 8: `FormButton` visible disabled treatment; `PositionDetailActions` gains `strategyType`,
  `hasOpenShortCall`, `onRollPmccShort`; `usePositionDetailSheets` gains `rollPmccShortOpen` and the
  `pmccRollRecorded` banner state.
- Area 9: `RollPmccShortCallSheet` / `RollPmccShortCallForm` / `PmccCoverageRuler`; the page banner;
  `PmccLegReference({ openLegs })`.
- Service: `insertLegRow` extraction into `leg-rows.ts` is a Refactor candidate there.

### Sibling stories (read from Linear)

- **US-102** (Backlog; blocks this story) owns the comparator and both messages. Its LEAPS-roll AC:
  error beside the replacement LEAPS expiration says **"LEAPS call must expire after the short call."**,
  equality rejected, skipped when no short is open, bypass leaves the pair unchanged. It does not name
  an error code; US-104 chose `short_not_before_long` for its half (US-101's code). It also flags the
  `FormButton` disabled treatment, which US-104 carries.
- **US-103** (In Progress → implemented on `wb-103`) owns the formula, snapshot, LEAPS-cost-to-date line
  and the re-anchoring. This story calls `appendPmccSnapshot` with `'PMCC_LEAPS_ROLL'` and computes
  no basis.
- **US-104** (Backlog, planned) — sibling. Linear: "Not a prerequisite, but whichever lands first
  should extract the shared pieces." US-104 is planned first, so US-105 consumes and generalizes.
- **US-107** fires the alert that prompts this roll (no deep link here); **US-109** renders the
  "LEAPS roll #1 credit" history line; **US-115** adds `Sell Short Call` for the LEAPS-only state;
  **US-118** owns the final header-action set; **US-120** closes the PMCC by selling the LEAPS.

## Architecture Decisions

### ADR: US-105 builds on `wb-104` and generalizes US-104's shared pieces instead of duplicating them

- **Decision:** The plan assumes the sequence `wb-103 → wb-104 → wb-105`: every main-process area
  imports US-103's `appendPmccSnapshot` / `groupRollChains` / `readLegs` and US-104's `pmccOpenLegs`,
  and every renderer area reuses US-104's `pmcc-roll.ts` helpers, `PmccCoverageRuler`, `FormButton`
  disabled treatment, `PositionDetailActions` PMCC branch, `usePositionDetailSheets` banner state and
  the sheet skeleton. Where US-104's shape is short-roll-specific, this story **generalizes it in
  place** and updates US-104's call sites: `pmccRollNet` takes `{ received, paid }` instead of
  `{ premium, costToClose }`; `pmccRollLabel` takes a month format (`'MMM'` for the short roll,
  `'MMM yyyy'` for the LEAPS roll) and gains the `In` direction; `PmccCoverageRuler` becomes the
  consolidated mockup's marks-based `Ruler` (`today`, `blocked`, `fillTo`, `marks[]`, `note`) with each
  form supplying its own marks and note; the banner state becomes a discriminated union over the two
  roll kinds. If US-105 is picked up before US-104 lands, the areas marked **★** in `plan.md` absorb
  US-104's Areas 1, 3, 8 and the shared halves of 7 and 9 — the names stay as US-104's plan spells
  them so the later story collapses to "import".
- **Why:** Linear says the two rolls share "the sheet layout, coverage ruler, and roll-label helper"
  and that whichever lands first extracts them. US-104's plan exists with concrete names; writing a
  second ruler and a second net helper is the duplication both stories tell us to avoid.
  Generalizing by parameter (`received/paid`, month format, marks) is smaller than a second copy and
  keeps the wheel's `rolls.ts` untouched.
- **Alternatives considered:** Build US-105 standalone against `wb-103` and let US-104 merge into it —
  reverses the agreed order and makes US-104's plan stale. Reuse the wheel's `getCcRollTypeDetail` —
  wrong text shape (`$185 → $190 strike, Apr 18 → May 16 expiration`). Share one `RollPmccSheet` with a
  `side` prop — the two sheets differ in section order, read-only context, which figure re-anchors and
  which checks are skipped; a flag-driven sheet would be the "generalize for two uses" the US-14 ADR
  rejected.

### ADR: `rollPmccLeaps` is a new pure lifecycle function with a fixed rule order; no "on or after current" rule

- **Decision:** Add to `src/main/core/lifecycle.ts`:

  ```ts
  interface RollPmccLeapsInput {
    currentPhase: WheelPhase
    currentLeaps: { strike: string; expiration: string }
    openShort: { strike: string; expiration: string } | null
    newStrike: string
    newExpiration: string
    proceedsPerContract: string
    replacementDebitPerContract: string
  }
  interface RollPmccLeapsResult {
    phase: 'PMCC_OPEN'
  }
  ```

  Rules, in order, first failure throws `ValidationError(field, code, message)`:

  | #   | Rule                                                                                  | field                         | code                     | message                                                           |
  | --- | ------------------------------------------------------------------------------------- | ----------------------------- | ------------------------ | ----------------------------------------------------------------- |
  | 1   | `currentPhase !== 'PMCC_OPEN'`                                                        | `__phase__`                   | `invalid_phase`          | `Position is not in PMCC_OPEN phase`                              |
  | 2   | `proceedsPerContract ≤ 0`                                                             | `proceedsPerContract`         | `must_be_positive`       | `Proceeds from close must be greater than zero`                   |
  | 3   | `replacementDebitPerContract ≤ 0`                                                     | `replacementDebitPerContract` | `must_be_positive`       | `Replacement debit must be greater than zero`                     |
  | 4   | `newStrike ≤ 0`                                                                       | `newStrike`                   | `must_be_positive`       | `Strike must be positive`                                         |
  | 5   | `openShort !== null && !shortExpiresBeforeLeaps(openShort.expiration, newExpiration)` | `newExpiration`               | `long_not_after_short`   | `LEAPS call must expire after the short call.` (US-102's inverse) |
  | 6   | `openShort !== null && !shortStrikeAboveLeaps(openShort.strike, newStrike)`           | `newStrike`                   | `strike_not_below_short` | `LEAPS strike must be below the short-call strike ($112.00).`     |
  | 7   | `newStrike == currentLeaps.strike && newExpiration === currentLeaps.expiration`       | `__roll__`                    | `no_change`              | `Roll must change the strike, the expiration, or both`            |

  Rules 5 and 6 are **skipped when `openShort` is null** (the AC's "no short-strike or
  long-versus-short expiration check is applied"). There is deliberately **no**
  `must_be_on_or_after_current` rule: the AC allows a replacement earlier than the current LEAPS with
  an advisory. Strikes compare as `Decimal` after the service formats both to 4 dp; the message's
  `$112.00` is `new Decimal(openShort.strike).toFixed(2)`. The LEAPS itself is not nullable in the
  input: the service reports a PMCC with no long leg as `__root__` / `no_active_leg` before calling
  the engine (same as US-104), so "has an open LEAPS" is the type, not a rule. Same underlying and
  same contract count are structural — the service copies `contracts` from the open LEAPS leg and the
  position owns the ticker — so neither is an engine rule.

- **Why:** Mirrors `rollPmccShortCall`'s order (phase → field-level money → coverage → shape →
  no-change) so the two PMCC rolls read the same way and the IPC error table gains no synonyms
  (`__roll__` / `no_change`, `must_be_positive`). Coverage precedes strike because it is the naked-call
  safety rule; both precede no-change so "$80 / 2027-07-16" reports the comparator, not no-change.
- **Alternatives considered:** Extend `rollCc` or `rollPmccShortCall` with a `side` flag — different
  nullable leg, inverted direction, an extra strike rule and a dropped date rule; replicate-not-
  generalize (US-14 ADR). Put the coverage check only in the service — every other roll rule lives in
  the engine, where the property tests run. Make `openShort` a discriminated union — one nullable is
  enough (US-104 data-model).

### ADR: The long-side half of US-102 and the strike-ordering predicate live in `pmcc-rules.ts`

- **Decision:** `src/main/core/pmcc-rules.ts` exports, beside US-104's `shortExpiresBeforeLeaps` /
  `SHORT_NOT_BEFORE_LONG`:
  - `LONG_NOT_AFTER_SHORT = { code: 'long_not_after_short', message: 'LEAPS call must expire after the short call.' } as const satisfies Pick<PmccIssue, 'code' | 'message'>`
    — the inverse message from US-102's AC, so the renderer schema, the engine and (later) US-115
    spell it once. **No second predicate**: the long side calls
    `shortExpiresBeforeLeaps(openShort.expiration, newExpiration)` with the arguments swapped; one
    comparison, two messages, as US-102 intends.
  - `shortStrikeAboveLeaps(shortStrike: string, longStrike: string): boolean` =
    `new Decimal(shortStrike).gt(longStrike)`, and `pmccCrossLegIssues` uses it for its
    `strike_not_above_long` rule — the extraction the story says to reuse "if US-101 extracted a pure
    strike-ordering check". US-101's message and code are untouched.
  - `leapsStrikeNotBelowShortMessage(shortStrike: string): string` → `LEAPS strike must be below the
short-call strike ($112.00).` with `STRIKE_NOT_BELOW_SHORT_CODE = 'strike_not_below_short'`, so the
    engine and the form schema format the one message identically. `pmcc-rules.ts` already imports
    `decimal.js`; it stays free of I/O and logging.
- **Why:** US-102: "centralize the pure comparison … rather than leaving a second inline copy on each
  roll path". The renderer's `pmcc-entry.ts` already imports this module, so the form schema reads the
  engine's text with no new coupling. Keeping the strike predicate beside the date predicate makes
  `pmcc-rules.ts` the one home for "the shape of a PMCC".
- **Alternatives considered:** Hard-code the inverse message in `lifecycle.ts` — the drift US-102
  exists to prevent. Add `leapsExpiresAfterShort(long, short)` as a named alias — a second function for
  the same comparison invites divergence; the swapped call reads clearly with the constant beside it.

### ADR: `rollPmccLeapsPosition` writes the inverted pair and calls US-103's writer in one transaction

- **Decision:** `src/main/services/roll-pmcc-leaps-position.ts` exports
  `rollPmccLeapsPosition(db, positionId, payload: RollPmccLeapsPayload): RollPmccLeapsResult`. Flow:
  `getPosition` (→ `__root__` / `not_found`), `pmccOpenLegs(detail.legs)` (→ `__root__` /
  `no_active_leg` when null), format money to 4 dp, `newStrike` defaults to the open LEAPS strike, call
  `rollPmccLeaps({ currentPhase, currentLeaps: { strike, expiration }, openShort: short && { strike, expiration }, ... })`,
  then inside **one** `db.transaction`: insert `ROLL_FROM` (**`SELL` `CALL`**, the open LEAPS strike /
  expiration / contracts, `premium = fill = proceeds`, `fees = '0.0000'`, new `roll_chain_id`), insert
  `ROLL_TO` (**`BUY` `CALL`**, replacement strike / expiration, same contracts,
  `premium = fill = replacementDebit`, same chain), then
  `appendPmccSnapshot(db, positionId, { triggerEvent: 'PMCC_LEAPS_ROLL', eventDate: fillDate, now })`.
  The position row is untouched (phase stays `PMCC_OPEN`; the short, if open, is untouched). Returns
  `position`, the two legs, `rollChainId`, the snapshot narrowed to `'PMCC_LEAPS_ROLL'`, the writer's
  `ledger`, and `leapsRollNumber` = long-side chains in `detail.legs` (`rollFrom.action === 'SELL'`)
  - 1. Leg inserts go through `insertLegRow` in `leg-rows.ts` if US-104's Refactor extracted it;
       otherwise the two `INSERT` statements mirror `roll-cc-position.ts` with the actions swapped.
- **Why:** The story: "writes ROLL_FROM + ROLL_TO + the cost-basis snapshot in one transaction,
  sharing a new roll_chain_id … lets US-103 own the formula, the LEAPS-cost-to-date line, the single
  net history row, and the re-anchoring". `groupRollChains` nets by action and `newestLongBuy` picks
  the SELL-chain's `ROLL_TO`, so the inverted pair needs no flag anywhere downstream: the ledger reads
  `19.3000`, `leapsCostPerShare` reads `22.5000`, `effectiveShareCost` reads `104.3000`. Returning the
  ledger lets the banner and the e2e assert the post-roll figures from the response.
- **Alternatives considered:** Fees on the roll legs — no input in the AC or either mockup; the
  wheel and US-104 write `'0.0000'`. Record the LEAPS sale as `LEAPS_CLOSE` + a new `LEAPS_OPEN` —
  breaks "rolls are always linked leg pairs" and the chain netting US-103 built for exactly this case.

### ADR: A dedicated payload schema and a generic `RollResultBase`

- **Decision:** `RollPmccLeapsPayloadSchema = z.object({ positionId, proceedsPerContract: z.number().positive(), replacementDebitPerContract: z.number().positive(), newExpiration: IsoDateSchema, newStrike: z.number().positive().optional(), fillDate: z.string().optional() })`
  — not `RollPayloadBaseSchema`, whose `costToClosePerContract` / `newPremiumPerContract` names
  describe a short roll's cash and would mislabel the AC's field-level errors. Money crosses the IPC
  as numbers like every roll channel (US-104 ADR); the service formats to 4 dp. `RollResultBase`
  becomes `RollResultBase<From extends LegAction = 'BUY', To extends LegAction = 'SELL'>`; the three
  existing results are unchanged by the defaults and `RollPmccLeapsResult extends RollResultBase<'SELL', 'BUY'>`
  narrows `costBasisSnapshot` to `{ triggerEvent: 'PMCC_LEAPS_ROLL'; finalPnl: null }` and adds
  `position: { …; phase: 'PMCC_OPEN' }`, `ledger: PmccLedgerResult`, `leapsRollNumber: number`.
- **Why:** The AC's error strings are "Proceeds from close must be greater than zero" and
  "Replacement debit must be greater than zero" **beside their fields**; the field names on the wire
  should say what the money is. Making the base generic derives the inverted pair from the shipped
  type instead of a hand-copied interface that could drift (data-model § Type Design).
- **Alternatives considered:** Reuse `RollPayloadBaseSchema` with the short-roll names — wrong
  vocabulary at the one place a bypass caller reads it. A fully separate `LeapsRollResult` interface
  — a second copy of the pair shape.

### ADR: The sheet is the consolidated mockup's `RollLeapsSheet`; both advisories are renderer-side

- **Decision:** `RollPmccLeapsSheet` (portal, `SheetPanel width={440}`, `role="dialog"
aria-label="Roll LEAPS"`, Escape / scrim / Cancel close without recording) owns a React Hook Form
  instance (`mode: 'onChange'`, `zodResolver(rollPmccLeapsSchema(ctx))`) and renders
  `RollPmccLeapsForm`, whose sections follow the mockup top to bottom: **Coverage** (the shared ruler
  with marks `Today`, `Open short call` (or `none`), `Current LEAPS (selling)`, `Replacement LEAPS
(buying)`; red when blocked by the comparator), **Current LEAPS** (Contract, Expiration with DTE,
  Bought at, LEAPS cost to date, Cost basis, `Effective share cost` highlighted, the "re-anchors"
  note), **Open short call** (Contract, Expiration with DTE, Sold at, `Read-only. The replacement
LEAPS must expire after it and strike below it.` — or `No short call open — nothing to cover, so the
expiration and strike checks are skipped.`), **Replacement LEAPS** (Proceeds from close / share,
  Debit (buy to open) / share, Strike, Expiration with a `N DTE` hint, Fill date defaulting to today,
  read-only Contracts), the **Net** card or its dashed placeholder (`Enter the proceeds from close and
the replacement debit to preview the net.`), the advisory **warning** (`Open short strike $112.00 is
below your effective share cost of $112.80 after this roll. If assigned, covering from the LEAPS
realizes roughly $0.80 per share of loss.`), the advisory **info** note (`Replacement LEAPS is 42 DTE,
28 days shorter than the current LEAPS. It still covers the open short call.`), the no-change error,
  and a footer with the red blocked note (`The XYZ $80.00 LEAPS stays open at 2027-09-17. No close or
replacement leg is recorded.` for either the comparator or the strike rejection), Cancel / `Confirm
roll` (`disabled={!formState.isValid}`) and `Your draft is kept until the roll is valid. No order is
placed.` Live figures come from `useWatch` through `pmcc-roll.ts`: `pmccRollNet({ received: proceeds,
paid: debit })`, `pmccRollLabel(current, next, 'MMM yyyy')`, `pmccPostRollEffectiveCost({ basisPerShare,
leapsStrike: newStrike, net })` (**the replacement strike** — this is the re-anchoring),
  `pmccStrikeShortfall(openShort.strike, effectiveAfter)`, and the new `leapsCoverageChange(current,
replacement)` (calendar days, negative = shorter). Neither advisory touches `isValid`.
- **Why:** The story's notes: "Warning is renderer-side … compare the open short strike against the
  post-roll effective share cost … Advisory only"; "Coverage advisory … Advisory only"; ADR
  `soft-client-side-warnings`. `mode: 'onChange'` makes "the confirm action is disabled" true while
  typing, which six scenarios assert. The sheet names `Roll LEAPS Call` with subtitle
  `XYZ CALL $80.00 · exp 2027-09-17 · 70 DTE` (the per-story mockup's header) rather than the
  consolidated file's `US-105 · …` subtitle, which is prototype chrome.
- **Alternatives considered:** Block the shortened-coverage roll — the AC allows it and the domain
  review calls it legitimate. Reuse `RollPmccShortCallForm` with a `side` prop — see the first ADR.

### ADR: The net preview and the roll label are the AC's exact strings; the LEAPS label carries the year

- **Decision:** `data-testid="pmcc-leaps-roll-net"` renders `Net Credit: $2.50 per share ($250.00
total)` / `Net Debit: $3.20 per share ($320.00 total)` (amount `text-wb-green` / `text-wb-red`).
  `data-testid="pmcc-leaps-roll-label"` renders `pmccRollLabel(current, next, 'MMM yyyy')`:
  `Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration`, `Roll Out: same $80 strike, Sep
2027 to Jan 2028 expiration`, `Roll In: same $80 strike, Sep 2027 to Aug 2027 expiration` (the
  shortened-coverage case), `Roll Up: $80 to $85 strike, same Sep 2027 expiration`, plus `Down`
  variants; followed by ` · 196 DTE`. Same-month-different-day adds the day as US-104 does. Strikes
  print via `Decimal.toString()` (`$80`, `$85`, `$112.5`).
- **Why:** The AC quotes these strings verbatim and they span calendar years, which the short roll's
  month-only form cannot express. One helper with a month-format parameter keeps the two labels in
  one place.
- **Alternatives considered:** A separate `pmccLeapsRollLabel` — a second copy of the direction and
  timing logic.

### ADR: Success closes the sheet and the page banner names the ledger line; one banner slot for both rolls

- **Decision:** On success the sheet calls `onRecorded(result)`; `usePositionDetailSheets` closes it
  and stores `pmccRollRecorded: { kind: 'short'; result: RollPmccShortCallResponse } | { kind: 'leaps'; result: RollPmccLeapsResponse } | null`
  (US-104's `RollPmccShortCallResponse | null` widened to this union; its call site sets
  `kind: 'short'`). `PositionDetailPage` renders `AlertBox variant="success"
data-testid="pmcc-leaps-roll-recorded-banner"`: `Rolled — sold to close XYZ $80.00 CALL 2027-09-17 at
$26.00, bought to open XYZ $85.00 CALL 2028-01-21 at $23.50. LEAPS roll #1 credit · $2.50 per share
($250.00 total). Both legs share one roll chain.` The banner clears when any roll sheet opens again.
  TanStack invalidation refetches the detail: the `Cost basis` drawer reads `$19.30` / `LEAPS cost to
date $22.50` / `Effective share cost $104.30`, and `PmccLegReference` shows the $85 LEAPS and the
  unchanged $112 short.
- **Why:** The consolidated mockup's `rl-recorded` preset puts the confirmation on the page, not in
  the sheet. The AC's "history shows one line 'LEAPS roll #1 credit' of $2.50 per share" is US-109's
  timeline; until it ships the banner is where the recorded net line is shown, backed by the one
  `PMCC_LEAPS_ROLL` snapshot and one chain the e2e asserts. A discriminated union makes "two banners
  at once" unrepresentable.
- **Alternatives considered:** A `RollPmccLeapsSuccess` panel like `RollCcSuccess` — not the mockup.
  Two independent banner states — allows both to show after two rolls.

### ADR: One header action; the roll is offered whenever the PMCC has an open LEAPS

- **Decision:** `PositionDetailActions` gains `onRollPmccLeaps` and renders `Roll LEAPS →`
  (`data-testid="roll-pmcc-leaps-btn"`) when `strategyType === 'PMCC' && hasOpenLeaps`, after
  US-104's `Roll Short Call →` (consolidated mockup order: `Roll Short Call →`, …, `Roll LEAPS →`;
  LEAPS-only: `Sell Short Call →`, `Roll LEAPS →`, `Close Position →`). `hasOpenLeaps =
Boolean(data.pmccOpenLegs)`. The wheel branches are untouched, so a `CC_OPEN` wheel never shows it.
- **Why:** The AC's two entry states — short open and no short open — both offer the roll; the only
  PMCC that cannot roll its LEAPS has no LEAPS, which `pmccOpenLegs === null` already encodes. US-118
  owns the final set.
- **Alternatives considered:** Gate on `phase === 'PMCC_OPEN'` only — a PMCC row with no long leg
  (unreachable via the app) would open a sheet with nothing to show.

### ADR: E2e reaches the Background through US-103's seam and the `SHORT_ROLL` fixture

- **Decision:** `e2e/pmcc-leaps-roll.spec.ts` launches with `NODE_ENV: 'test'`, calls `createXyzPmcc`
  then `recordEvents([EXPIRE_1(), SHORT_2(), SHORT_ROLL()])`, opens the detail and drives the real
  `Roll LEAPS →` button and sheet. That state **is** the AC Background: open short `$112.00` sold at
  `$2.40` expiring `localDate(95)`, LEAPS `$80.00` bought at `$25.00` expiring `localDate(368)`, basis
  `$21.80`, effective `$101.80`. The no-short scenario adds a new `EXPIRE_2()` event (`SHORT_CALL_EXPIRED`
  for the $112 short at `localDate(95)`, trigger `PMCC_SHORT_EXPIRED`) so the roll still lands at
  `$19.30` as the AC states. Replacement dates are run-day-relative: `localDate(494)` (up & out / out),
  `localDate(860)` (too much time), `localDate(340)` (shortens coverage: 28 days before `localDate(368)`),
  `localDate(95)` and `localDate(81)` (uncovers), `localDate(368)` (no change). Expected DTE, month
  labels and the "N days shorter" figure are computed in the spec with `date-fns` from the same
  `localDate` values; money is the AC's. Bypass assertions call `window.api.rollPmccLeaps` directly and
  read `tableCount(dbPath, 'legs')` and `getPosition`.
- **Why:** The seam exists for this; `SHORT_ROLL` is already the fixture that produces the AC's open
  $112 short. Driving the roll through the UI makes the form rules falsifiable.
- **Alternatives considered:** Seed the Background by SQL — bypasses the snapshot chain the "one net
  line" assertion reads. Start from `EXPIRE_1` only for the no-short case — lands at $20.50, not the
  AC's $19.30.

### ADR: Logging

- **Decision:** Service: DEBUG `roll_pmcc_leaps_inputs { positionId, fillDate, newStrike, newExpiration, shortOpen }`,
  `roll_pmcc_leaps_tx_start` / `_tx_committed { positionId, rollChainId }`; INFO
  `pmcc_leaps_rolled { positionId, rollChainId, netCreditPerShare, basisPerShare, effectiveShareCost, leapsRollNumber }`;
  INFO `pmcc_leaps_roll_rejected { positionId, field, code }` on `ValidationError`.
  `appendPmccSnapshot` keeps its own INFO. Nothing in `core/`.
- **Why:** CLAUDE.md logging standards; mirrors US-104's `pmcc_short_call_rolled` / `_rejected`.

## Worked figures (the AC's XYZ Background, 1 contract, $0 fees; basis 21.80, LEAPS cost 25.00, eff 101.80)

| Scenario          | proceeds | strike | debit | net / share  | total     | basis after | LEAPS cost after | eff. after                      | label / note                                                        |
| ----------------- | -------- | ------ | ----- | ------------ | --------- | ----------- | ---------------- | ------------------------------- | ------------------------------------------------------------------- |
| up & out (credit) | 26.00    | 85     | 23.50 | +2.50 credit | $250.00   | 19.30       | 22.50            | 85 + 19.30 = 104.30             | `Roll Up & Out: $80 to $85 strike, Sep 2027 to Jan 2028 expiration` |
| out (debit)       | 26.00    | 80     | 29.20 | −3.20 debit  | $320.00   | 25.00       | 28.20            | 80 + 25.00 = 105.00             | `Roll Out: same $80 strike, Sep 2027 to Jan 2028 expiration`        |
| too much time     | 26.00    | 80     | 37.00 | −11.00 debit | $1,100.00 | 32.80       | 36.00            | 112.80 → shortfall 0.80 vs $112 | warning                                                             |
| shortens coverage | 26.00    | 80     | 26.60 | −0.60 debit  | $60.00    | 22.40       | 25.60            | 102.40                          | info: `42 DTE, 28 days shorter`; label `Roll In: same $80 strike…`  |

`basis after = 21.80 − net`; `LEAPS cost after = 25.00 − net`; `effective after = newStrike + basis
after`. After the up-and-out roll is recorded the chain has five snapshots: `PMCC_OPEN`,
`PMCC_SHORT_EXPIRED`, `PMCC_SHORT_OPEN`, `PMCC_SHORT_ROLL`, `PMCC_LEAPS_ROLL` reading
`23.0000, 23.0000, 21.2000, 21.8000, 19.3000`; `totalPremiumCollected` stays `320.0000`.

## Open Questions

None blocking. Three assumptions are stated above rather than asked:

- **Sequence `wb-103 → wb-104 → wb-105`.** US-105 consumes US-104's shared pieces and generalizes them
  in place. If the order flips, the **★** areas in `plan.md` absorb the US-104 pieces they depend on,
  under US-104's names.
- **The inverse comparator's code is `long_not_after_short`.** US-102 names only the message; this code
  pairs with US-104's `short_not_before_long`. US-102 may rename it when it lands — the constant is
  the one place to change.
- **No fees input on the roll** — the AC and both mockups have none; roll legs write `fees = '0.0000'`
  like the wheel's and US-104's. Listed in the plan's out-of-scope.
