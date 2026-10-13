# US-105 — Roll the PMCC LEAPS to a further expiration when DTE is low — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- Plan sections are referenced as **Plan § N** (`plans/us-105/plan.md`); the exact figures, messages
  and test-ids live there and in `data-model.md` / `research.md` — copy them, do not paraphrase
- **US-104 has landed on this branch**, so every ★ "if US-104 has not landed" fallback in the plan is
  **skipped**. Reuse what exists: `shortExpiresBeforeLeaps` / `SHORT_NOT_BEFORE_LONG`
  (`pmcc-rules.ts`), `pmccOpenLegs` / `GetPositionResult.pmccOpenLegs`, `insertLegRow`
  (`leg-rows.ts`), `applyIpcFieldErrors` (`lib/ipc-field-errors.ts`), `moneySchema` in
  `schemas/common.ts`, `lib/pmcc-roll.ts`, `PmccCoverageRuler`, `e2e/pmcc-roll-helpers.ts`
- `better-sqlite3` ABI: `pnpm rebuild:node` before Vitest layers, `pnpm rebuild:electron` before the
  e2e layer — never run the two concurrently

---

## Layer 1 — Foundation (no dependencies)

> These areas can be started immediately and run in parallel.

### 1. Shared PMCC shape rules (Plan § 1)

- [x] **[Red]** Write failing tests — `src/main/core/pmcc-rules.test.ts`
  - Test cases: `shortStrikeAboveLeaps('112.0000','85.0000')` → `true`; equal (`'112.0000'`,`'112'`) → `false`;
    lower short → `false`. `LONG_NOT_AFTER_SHORT` equals `{ code: 'long_not_after_short', message: 'LEAPS call must expire after the short call.' }`.
    `leapsStrikeNotBelowShortMessage('112.0000')` → `LEAPS strike must be below the short-call strike ($112.00).`;
    `('112.5')` → `($112.50)`. `STRIKE_NOT_BELOW_SHORT_CODE === 'strike_not_below_short'`.
    Regression: `pmccCrossLegIssues` still reports `('short.strike','strike_not_above_long', …)` and the valid pair yields `[]`
  - Property cases: oracle — `shortStrikeAboveLeaps(a, b) === new Decimal(a).gt(b)` for any two `positiveMoney()`;
    iff — `pmccCrossLegIssues` over a valid pair with only strikes varied contains `strike_not_above_long`
    iff `!shortStrikeAboveLeaps(short, long)` — `src/main/core/pmcc-rules.property.test.ts`
  - Run `pnpm test src/main/core/pmcc-rules` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/pmcc-rules.ts` _(depends on: Area 1 Red ✓)_
  - `shortStrikeAboveLeaps(shortStrike, longStrike): boolean`, `LONG_NOT_AFTER_SHORT` (`as const satisfies Pick<PmccIssue,'code'|'message'>`),
    `STRIKE_NOT_BELOW_SHORT_CODE`, `leapsStrikeNotBelowShortMessage(shortStrike)` (per data-model.md § 4)
  - Replace the inline `new Decimal(short.strike).lte(long.strike)` in `pmccCrossLegIssues` with `!shortStrikeAboveLeaps(...)`
  - Run `pnpm test src/main/core/pmcc-rules` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/pmcc-rules.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: group `SHORT_NOT_BEFORE_LONG` + `LONG_NOT_AFTER_SHORT` under one `// US-102 — PMCC coverage comparator` block
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 3. Payload schema, `RollResultBase` and the result type (Plan § 3)

- [x] **[Red]** Write failing tests — `src/main/schemas.pmcc.test.ts`
  - Test cases: `RollPmccLeapsPayloadSchema.parse` accepts the contract example; rejects `proceedsPerContract: 0`,
    `replacementDebitPerContract: 0` (`too_small`), non-ISO `newExpiration`, missing `positionId`; `newStrike` / `fillDate` optional;
    `expectTypeOf<RollPmccLeapsPayload>().not.toHaveProperty('costToClosePerContract')`
  - Type-level: `rollFromLeg.action` is `'SELL'`, `rollToLeg.action` is `'BUY'`, `position.phase` is `'PMCC_OPEN'`,
    `costBasisSnapshot.triggerEvent` is `'PMCC_LEAPS_ROLL'`, `RollPmccLeapsResult extends RollResultBase<'SELL','BUY'>`;
    regression: `RollCcResult['rollFromLeg']['action']` still `'BUY'` and `RollCcResult extends RollResultBase`
  - Run `pnpm test src/main/schemas.pmcc` — all new tests must fail
- [x] **[Green]** Implement — `src/main/schemas.ts` _(depends on: Area 3 Red ✓)_
  - `RollPmccLeapsPayloadSchema` next to `RollCcPayloadSchema`; `RollPmccLeapsPayload = z.infer<…>`
  - `RollResultBase<From extends LegAction = 'BUY', To extends LegAction = 'SELL'>` (import `LegAction` from `./core/types`); existing results untouched
  - `RollPmccLeapsResult extends RollResultBase<'SELL','BUY'>` with `position`, narrowed `costBasisSnapshot`, `ledger: PmccLedgerResult`, `leapsRollNumber` (data-model.md § 1, § 4)
  - Run `pnpm test src/main/schemas.pmcc` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/schemas.ts` _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: naming consistency with `RollPmccShortCallResult` (`shortCallRollNumber` ↔ `leapsRollNumber`)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 6a. Renderer pure helpers generalized — `pmcc-roll.ts` (Plan § 6, helpers half)

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/pmcc-roll.test.ts`
  - Test cases: `pmccRollNet({ received, paid, contracts })` — `26.00/23.50` credit `2.50`/`250.00`; `26.00/29.20` debit `3.20`/`320.00`;
    `26.00/37.00` debit `11.00`/`1,100.00`; 3 contracts → `750.00`; `''`/`'0'` → `null`. US-104 cases re-expressed with `received`/`paid`
  - `pmccRollLabel(current, next, 'MMM yyyy')`: Up & Out, Out (same strike), **In** (`2027-08-20`), Up (same expiration),
    Down & Out, no change → `null`, `'112.5000'` → `$112.5`; default format still yields US-104's `Nov to Dec` and same-month `Nov 20 to Nov 27`
  - `pmccPostRollEffectiveCost` → `19.30/104.30`, `25.00/105.00`, `32.80/112.80`; `pmccStrikeShortfall('112.0000','112.80')` → `'0.80'`, `104.30`/`112.00` → `null`
  - `leapsCoverageChange('2027-09-17','2027-08-20')` → `-28`; `('2027-09-17','2028-01-21')` → `126`; incomplete → `null`
  - Run `pnpm test src/renderer/src/lib/pmcc-roll` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/pmcc-roll.ts`, `src/renderer/src/components/RollPmccShortCallForm.tsx` _(depends on: Area 6a Red ✓)_
  - `PmccRollCash { received, paid, contracts }`; `pmccRollLabel(current, next, monthFormat: RollLabelMonthFormat = 'MMM')` with `In`;
    `leapsCoverageChange` via `differenceInCalendarDays(parseISO(…))` guarded by the ISO regex; pure, no React
  - Update `RollPmccShortCallForm` to call `pmccRollNet({ received: premium, paid: costToClose, contracts })`
  - Run `pnpm test src/renderer/src/lib/pmcc-roll src/renderer/src/components/RollPmccShortCallForm` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/pmcc-roll.ts` _(depends on: Area 6a Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 7a. Marks-based `PmccCoverageRuler` (Plan § 7, ruler half)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PmccCoverageRuler.test.tsx`, `RollPmccShortCallForm.test.tsx`
  - Test cases: marks with `date: null` render legend label + `value` but no tick (`data-mark` count = dated marks);
    `data-blocked="true"` → fill + tall mark `bg-wb-red`, else `bg-wb-gold`; `note` renders verbatim; percent widths are the only inline styles;
    US-104's four ruler cases re-expressed as marks + notes supplied by the test
  - Regression (`RollPmccShortCallForm.test.tsx`): `OUTLASTS` still `data-blocked="true"` with the naked-short note; no-replacement note
    `Current short call expires in <n> days. The LEAPS covers <m> days.`
  - Run `pnpm test src/renderer/src/components/PmccCoverageRuler src/renderer/src/components/RollPmccShortCallForm` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PmccCoverageRuler.tsx`, `RollPmccShortCallForm.tsx` _(depends on: Area 7a Red ✓)_
  - `PmccCoverageRuler({ today, blocked, fillTo, marks: PmccRulerMark[], note })` — axis spans max DTE of dated marks, fill to `fillTo`,
    `data-mark={key}` ticks, `LegendItem` per mark (tone → `bg-wb-text-muted` / `bg-wb-text-secondary` / `bg-wb-green` / `bg-wb-gold`|`bg-wb-red`),
    note `text-wb-red` when blocked; DTE via `computeDteFromInput`; Tailwind only
  - `RollPmccShortCallForm` builds its four marks and note from the props it already has
  - Run the same tests — all must pass
- [x] **[Refactor]** `/refactor` — `PmccCoverageRuler.tsx` _(depends on: Area 7a Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 7b. `Roll LEAPS →` header action (Plan § 7, actions half)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/PositionDetailActions.test.tsx`
  - Test cases: `PMCC` + `hasOpenLeaps` + `hasOpenShortCall` → `roll-pmcc-short-btn` then `roll-pmcc-leaps-btn` (`Roll LEAPS →`), no wheel buttons;
    `PMCC` + `hasOpenLeaps` + `hasOpenShortCall: false` → leaps button only; `PMCC` + `hasOpenLeaps: false` → no roll buttons;
    `WHEEL` + `CC_OPEN` → `roll-cc-btn` present, both PMCC buttons absent
  - Run `pnpm test src/renderer/src/components/PositionDetailActions` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/PositionDetailActions.tsx` _(depends on: Area 7b Red ✓)_
  - Props `hasOpenLeaps`, `onRollPmccLeaps`; `{strategyType === 'PMCC' && hasOpenLeaps && <ActionButton testId="roll-pmcc-leaps-btn" label="Roll LEAPS →" … />}` after the US-104 button; wheel branches untouched
  - Run `pnpm test src/renderer/src/components/PositionDetailActions` — all tests must pass
- [x] **[Refactor]** `/refactor` — `PositionDetailActions.tsx` _(depends on: Area 7b Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Engine rule set + form schema (depends on Layer 1)

> These areas can run in parallel **after** Area 1 Green.

### 2. Pure lifecycle rule set `rollPmccLeaps` (Plan § 2)

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/main/core/lifecycle.test.ts` (`describe('rollPmccLeaps')`) _(depends on: Area 1 Green ✓)_
  - Fixture: `PMCC_OPEN`, `currentLeaps { '80.0000', '2027-09-17' }`, `openShort { '112.0000', '2027-07-16' }`
  - Accepted: Up & Out (`85`, `2028-01-21`, `26`, `23.5`); Out same strike with debit; shortened coverage (`2027-08-20`) — no on-or-after-current rule; same expiration higher strike
  - Every rejection in the research.md rule table as `ValidationError { field, code, message }` (phase, proceeds, debit, strike `0`,
    expiration `2027-07-16` / `2027-07-02` → `long_not_after_short`, strike `112` / `115` → `strike_not_below_short`, no change → `__roll__` / `no_change`)
  - Order: phase > proceeds > coverage > strike > no-change (four cases per Plan § 2)
  - `openShort: null`: strike `112` + `2028-01-21` accepted; `2027-07-16` accepted; no-change and `must_be_positive` still fire
  - Property cases — `src/main/core/lifecycle.property.test.ts`: phase guard row (`requiredPhase: 'PMCC_OPEN'`); coverage guard
    (`orderedDays(2)` as `[replacement, short]`); strike guard (`n = s + nonNegative`); no-short skip invariant; valid invariant (`[short, replacement]`, strike `< s`)
  - Run `pnpm test src/main/core/lifecycle` — all new tests must fail
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` _(depends on: Area 2 Red ✓)_
  - `RollPmccLeapsInput`, `RollPmccLeapsResult`, `rollPmccLeaps` per research.md § ADR "`rollPmccLeaps`"; reuse `requirePositiveDecimal`,
    `requirePositiveStrike`, `shortExpiresBeforeLeaps` + `LONG_NOT_AFTER_SHORT`, `shortStrikeAboveLeaps` + `STRIKE_NOT_BELOW_SHORT_CODE` /
    `leapsStrikeNotBelowShortMessage`; shape rules inside `if (input.openShort !== null)`; strike equality via `Decimal.eq`; no logging / I/O
  - Run `pnpm test src/main/core/lifecycle` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/main/core/lifecycle.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: private `requireRollChange(current, next)` shared by `rollPmccShortCall` and `rollPmccLeaps` (leave `rollCc` alone)
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 6b. Renderer form schema `roll-pmcc-leaps.ts` (Plan § 6, schema half)

**Requires:** Area 1 Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/schemas/roll-pmcc-leaps.test.ts` _(depends on: Area 1 Green ✓)_
  - Ctx: current `80.0000` / `2027-09-17`, `openShort { '112.0000', '2027-07-16' }`
  - `UP_OUT` parses; `2027-07-16` / `2027-07-02` → `['newExpiration']` with `LONG_NOT_AFTER_SHORT.message`; `112` / `115` → `['newStrike']`
    with `($112.00)` message; `80` + `2027-09-17` → `['__roll__']` no-change; `proceeds '0.00'` and `newDebit '0'` messages;
    `2027-08-20` + `80` → no issue; `''` expiration → only the ISO-date message
  - `openShort: null`: `2027-07-16` and `112` parse; no-change and money rules still fire
  - `toRollPmccLeapsPayload` → `{ positionId, proceedsPerContract: 26, replacementDebitPerContract: 23.5, newStrike: 85, newExpiration, fillDate }` (numbers; `fillDate` omitted when empty)
  - Run `pnpm test src/renderer/src/schemas/roll-pmcc-leaps` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/schemas/roll-pmcc-leaps.ts` _(depends on: Area 6b Red ✓)_
  - `RollPmccLeapsContext`, `rollPmccLeapsSchema(ctx)` (`z.object({ proceeds, newStrike, newDebit, newExpiration, fillDate, __roll__ }).superRefine(...)`
    reusing `moneySchema` from `schemas/common.ts` and the Area 1 exports), `RollPmccLeapsFormValues`,
    `EMPTY_ROLL_PMCC_LEAPS_DEFAULTS(today, currentStrike)` (strike at 2 dp; no `.default()`), `toRollPmccLeapsPayload(values, positionId)`
  - Run `pnpm test src/renderer/src/schemas/roll-pmcc-leaps` — all tests must pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/schemas/roll-pmcc-leaps.ts` _(depends on: Area 6b Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: any private `required` / money helpers still duplicated across `pmcc-entry.ts`, `roll-pmcc-short-call.ts` and this file → `schemas/common.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Service (depends on Layer 2)

### 4. Fixtures and the `rollPmccLeapsPosition` service (Plan § 4)

**Requires:** Area 2 Green ✓, Area 3 Green ✓

- [x] **[Red]** Write failing tests — `src/main/services/roll-pmcc-leaps-position.test.ts`, `pmcc-cost-basis-chain.test.ts` _(depends on: Area 2 Green ✓, Area 3 Green ✓)_
  - Add `EXPIRE_2` to `src/main/services/test-fixtures/pmcc-legs.ts` (`SHORT_CALL_EXPIRED` EXPIRE `112.0000` exp/fill `day(95)` premium `0.0000`)
  - Background: `createPmccPosition` + `EXPIRE_1`, `SHORT_2`, `SHORT_ROLL` with a snapshot per event via `appendPmccSnapshot`
  - Happy path: `ROLL_FROM` **SELL** `80.0000` / `day(368)` / `26.0000` / fees `0.0000`; `ROLL_TO` **BUY** `85.0000` / `day(494)` / `23.5000`; shared chain;
    snapshot `PMCC_LEAPS_ROLL` `19.3000` / total premium `320.0000`; ledger `1930.0000` / `22.5000` / `104.3000`; `leapsRollNumber 1`; phase `PMCC_OPEN`
  - DB state: legs +2, newest snapshot matches, position `phase`/`updated_at` unchanged, `pmccOpenLegs.long` `85.0000`/`ROLL_TO`, short id/strike unchanged
  - Debit roll (strike omitted → `80.0000`): `25.0000` / `105.0000`; second LEAPS roll → `2`; short-side chain does not count; `fillDate` omitted → `localToday()`
  - No short (+`EXPIRE_2`): strike `112` + `day(95)` accepted, basis `19.3000`
  - Rejections write nothing: `long_not_after_short`, `strike_not_below_short`, `not_found`, `invalid_phase` (wheel), `no_active_leg`
  - Rollback via `fail_snapshot` trigger → throws, leg and snapshot counts unchanged
  - Chain test: snapshots `23.0000, 23.0000, 21.2000, 21.8000, 19.3000` with the five triggers ending `PMCC_LEAPS_ROLL`
  - Run `pnpm test src/main/services/roll-pmcc-leaps-position src/main/services/pmcc-cost-basis-chain` — all new tests must fail
- [x] **[Green]** Implement — `src/main/services/roll-pmcc-leaps-position.ts` _(depends on: Area 4 Red ✓)_
  - `getPosition` → `pmccOpenLegs` (null → `no_active_leg`) → 4-dp formatting, `newStrike ?? long.strike` → `rollPmccLeaps(...)` →
    `db.transaction(() => { insertLegRow ROLL_FROM SELL; insertLegRow ROLL_TO BUY; return appendPmccSnapshot(db, id, { triggerEvent: 'PMCC_LEAPS_ROLL', eventDate: fillDate, now }) })()`
  - `leapsRollNumber = groupRollChains(detail.legs).filter((c) => c.rollFrom.action === 'SELL').length + 1`
  - Logging: INFO `pmcc_leaps_rolled`, INFO `pmcc_leaps_roll_rejected` on `ValidationError`, DEBUG inputs + tx checkpoints
  - Run the same tests — all must pass
- [x] **[Refactor]** `/refactor` — `roll-pmcc-leaps-position.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: shared `recordPmccRoll(db, positionId, { from, to, triggerEvent, fillDate })` in `pmcc-ledger.ts` with `roll-pmcc-short-call-position.ts` — only if both suites stay green and wheel services are untouched
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — Transport (depends on Layer 3)

### 5. IPC handler, preload, renderer adapter and hook (Plan § 5)

**Requires:** Area 3 Green ✓, Area 4 Green ✓

- [x] **[Red]** Write failing tests — `src/main/ipc/positions.test.ts`, `src/renderer/src/api/positions.test.ts` _(depends on: Area 4 Green ✓)_
  - IPC: channel `positions:roll-pmcc-leaps` registered; valid payload calls `rollPmccLeapsPosition(db, positionId, parsed)` → `{ ok: true, ...result }`;
    `proceedsPerContract: 0` → `{ ok: false, errors: [{ field: 'proceedsPerContract', … }] }` without calling the service;
    service `ValidationError` for `newExpiration`/`long_not_after_short` and `newStrike`/`strike_not_below_short` → envelope; generic throw → `internal_error`
  - Adapter: `rollPmccLeaps` passes the payload through; `{ ok: false }` → `ApiError` 400 with field errors; success returns the body
  - Run `pnpm test src/main/ipc/positions src/renderer/src/api/positions` — all new tests must fail
- [x] **[Green]** Implement — `src/main/ipc/positions.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/hooks/useRollPmccLeaps.ts` _(depends on: Area 5 Red ✓)_
  - `registerParsedPositionHandler(db, 'positions:roll-pmcc-leaps', 'positions_roll_pmcc_leaps_unhandled_error', RollPmccLeapsPayloadSchema, rollPmccLeapsPosition)` — nothing else
  - Preload / `index.d.ts` (`IpcRollPmccLeapsResult`) / adapter (`IpcPayload<'rollPmccLeaps'>`, `IpcSuccess<'rollPmccLeaps'>`) / hook over `usePositionMutation`, mirroring the `rollPmccShortCall` trio
  - Run the same tests — all must pass
- [x] **[Refactor]** `/refactor` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 5 — Sheet state + sheet components (depends on Layer 4)

> These areas can run in parallel with each other.

### 7c. Sheet state and the banner union — `usePositionDetailSheets` (Plan § 7, state half)

**Requires:** Area 5 Green ✓, Area 7b Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/usePositionDetailSheets.test.ts`, `src/renderer/src/pages/PositionDetailPage.test.tsx` _(depends on: Area 5 Green ✓, Area 7b Green ✓)_
  - Test cases: `handleRollPmccLeaps` opens `rollPmccLeapsOpen` and clears the banner; `overlayOpen` includes the new sheet;
    `handlePmccLeapsRollRecorded(res)` closes the sheet and sets `{ kind: 'leaps', result }`; US-104's handler sets `kind: 'short'`;
    opening either roll sheet clears the banner; setting one kind then the other — only the latter remains
  - Page: `PositionDetailPage` passes `hasOpenLeaps={Boolean(data.pmccOpenLegs)}` (button visible with and without an open short)
  - Run `pnpm test src/renderer/src/pages/usePositionDetailSheets src/renderer/src/pages/PositionDetailPage` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/usePositionDetailSheets.ts`, `PositionDetailPage.tsx` (props only) _(depends on: Area 7c Red ✓)_
  - `rollPmccLeapsOpen`, `handleRollPmccLeaps`, `handleCloseRollPmccLeaps`; `type PmccRollRecorded = { kind: 'short'; … } | { kind: 'leaps'; … } | null`
    (data-model.md § 4); `handlePmccShortRollRecorded` / `handlePmccLeapsRollRecorded`; update existing short-banner consumers to the union
  - Run the same tests — all must pass
- [x] **[Refactor]** `/refactor` — `usePositionDetailSheets.ts` _(depends on: Area 7c Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: fold the four roll booleans into one `openSheet` union only if existing tests stay green; otherwise leave the wheel's two alone
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### 8a. `RollPmccLeapsForm` + `RollPmccLeapsSheet` (Plan § 8, components)

**Requires:** Area 5 Green ✓, Area 6a Green ✓, Area 6b Green ✓, Area 7a Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/components/RollPmccLeapsForm.test.tsx`, `RollPmccLeapsSheet.test.tsx` _(depends on: Areas 5, 6a, 6b, 7a Green ✓)_
  - Form (ticker `XYZ`, leaps `80.0000` / `25.0000`, short `112.0000` / `2.4000` | null, ledger `21.8000` / `25.0000` / `101.8000`) — every Plan § 8 case:
    header; `Coverage` ruler marks + legend + window/no-window note; `Current LEAPS` six rows + re-anchor note; `Open short call` rows or the no-short sentence + `none` legend;
    input ids `pmcc-leaps-roll-{proceeds,debit,strike,expiration,fill-date,contracts}`; placeholder vs `pmcc-leaps-roll-net`;
    `UP_OUT`, `OUT_DEBIT`, `TOO_MUCH_TIME` (warning), `SHORTENS` (coverage note, `Roll In:`), `STRIKE_ABOVE`, `UNCOVERS` (blocked ruler + footer note),
    `NO_CHANGE`, `ZERO_PROCEEDS`, `ZERO_DEBIT`; `openShort: null` → no shape errors, no warning, confirm enabled; footer draft note; Cancel → `onClose`
  - Sheet (mock `useRollPmccLeaps`): `role=dialog[aria-label="Roll LEAPS"]` in the portal; Escape + scrim → `onClose`; valid submit → `mutate(toRollPmccLeapsPayload(...))`
    and `onRecorded(response)`; 400 field routing (`newExpiration`, `newStrike`, `proceedsPerContract → proceeds`, `replacementDebitPerContract → newDebit`,
    `__roll__`, `__root__`/`__phase__` → `root.save` alert `Could not record the roll. Your entries are preserved. Try again.`); draft survives; double click while pending ignored (`Recording…`)
  - Run `pnpm test src/renderer/src/components/RollPmccLeaps` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/components/RollPmccLeapsForm.tsx`, `RollPmccLeapsSheet.tsx` _(depends on: Area 8a Red ✓)_
  - Sheet: `createPortal` + `SheetOverlay` / `SheetPanel width={440}`; `useForm` (`mode: 'onChange'`, `zodResolver(rollPmccLeapsSchema(ctx))`, `EMPTY_ROLL_PMCC_LEAPS_DEFAULTS`);
    `useRollPmccLeaps({ onSuccess: onRecorded })`; `onError` → `applyIpcFieldErrors` with the field map
  - Form: the consolidated mockup's `RollLeapsSheet` top to bottom (`mockups/epic-09-pmcc-position-detail.mdx`; Linear figures from `mockups/us-105-roll-pmcc-leaps.mdx`) — `SheetHeader`, Coverage `SectionCard` with `PmccCoverageRuler` marks,
    `Current LEAPS`, `Open short call`, `Replacement LEAPS` grid (`NumberInput`, `Controller` + `DatePicker`), Net card (`pmcc-leaps-roll-net`, `pmcc-leaps-roll-label`, three after-roll rows + note),
    warning / coverage-note / `__roll__` / `root.save` `AlertBox`es, `SheetFooter` with stays-open note, Cancel + `Confirm roll` (`pmcc-leaps-roll-confirm`, `disabled={!isValid}`); `wb-*` tokens only
  - Run `pnpm test src/renderer/src/components/RollPmccLeaps` — all tests must pass
- [x] **[Refactor]** `/refactor` — `RollPmccLeapsSheet.tsx`, `RollPmccLeapsForm.tsx` _(depends on: Area 8a Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: extract `useRollSheetForm` shared with `RollPmccShortCallSheet` (second copy — wheel sheets untouched); `effectiveCostSentence(strike, basis)` in `pmcc-roll.ts`
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 6 — Page wiring + banner (depends on Layer 5)

### 8b. Mount the sheet and the success banner — `PositionDetailPage` (Plan § 8, page)

**Requires:** Area 7c Green ✓, Area 8a Green ✓

- [x] **[Red]** Write failing tests — `src/renderer/src/pages/PositionDetailPage.test.tsx` _(depends on: Areas 7c, 8a Green ✓)_
  - Test cases: clicking `Roll LEAPS →` opens `role=dialog[name="Roll LEAPS"]` and blurs content (also when `pmccOpenLegs.short === null`);
    `pmcc-leaps-roll-recorded-banner` for the `UP_OUT` response reads
    `Rolled — sold to close XYZ $80.00 CALL <exp> at $26.00, bought to open XYZ $85.00 CALL <exp> at $23.50. LEAPS roll #1 credit · $2.50 per share ($250.00 total). Both legs share one roll chain.`;
    debit response `… LEAPS roll #1 debit · $3.20 per share ($320.00 total).`; short and leaps banners never render together
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage` — new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/pages/PositionDetailPage.tsx` _(depends on: Area 8b Red ✓)_
  - `{rollPmccLeapsOpen && data.pmccOpenLegs && data.pmccLedger && <RollPmccLeapsSheet … onRecorded={handlePmccLeapsRollRecorded} />}`;
    banner switches on `pmccRollRecorded.kind` — `'leaps'` → `AlertBox variant="success"` built from `rollFromLeg`, `rollToLeg`, `leapsRollNumber`,
    `pmccRollNet({ received: rollFromLeg.premiumPerContract, paid: rollToLeg.premiumPerContract })`
  - Run `pnpm test src/renderer/src/pages/PositionDetailPage` — all tests must pass
- [x] **[Refactor]** `/refactor` — `PositionDetailPage.tsx` _(depends on: Area 8b Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 7 — E2E Tests

**Requires:** All Green tasks from previous layers ✓ — run `pnpm rebuild:electron` first

### 9. E2E Tests (Plan § 9)

- [x] **[Red]** Write failing e2e tests — `e2e/pmcc-leaps-roll.spec.ts` _(depends on: all Green tasks ✓)_
  - Helpers: `EXPIRE_2()` in `e2e/pmcc-ledger-helpers.ts`; in `e2e/pmcc-roll-helpers.ts` add `reachXyzLeapsRollBackground`, `reachXyzNoShort`,
    `openRollLeapsSheet`, `fillLeapsRoll`, `rollLeaps`, `monthYearLabel`, `dteOf` (if absent) and the date constants `LEAPS_EXP` (368), `SHORT_EXP` (95),
    `UP_OUT_EXP` (494), `TOO_MUCH_EXP` (860), `SHORTENS_EXP` (340), `BEFORE_SHORT_EXP` (81); reuse `fieldError`, `confirmButton`, `rollSheet`
  - Launch with `launchPmcc(dbPath, { env: { NODE_ENV: 'test' } })`; `afterEach` → `closePmcc`
  - One `it()` per AC row — names mirror the Gherkin (assertions per Plan § 9):
    - AC-1: The roll form shows the decision context for the open LEAPS → `it('The roll form shows the decision context for the open LEAPS')`
    - AC-2: Net credit preview for a roll up and out → `it('Net credit preview for a roll up and out')`
    - AC-3: Net debit preview for a roll out at the same strike → `it('Net debit preview for a roll out at the same strike')`
    - AC-4: Recording the roll creates a linked leg pair and one net cost-basis line → `it('Recording the roll creates a linked leg pair and one net cost-basis line')`
    - AC-5: Warning when the effective share cost after the roll rises above the open short strike → `it('Warning when the effective share cost after the roll rises above the open short strike')`
    - AC-6a: Outline strike $112.00 → `it('Reject a replacement strike that is not below the open short strike — $112.00')`
    - AC-6b: Outline strike $115.00 (+ IPC bypass, `legs` count 6) → `it('Reject a replacement strike that is not below the open short strike — $115.00')`
    - AC-7a: Outline expiration = short (+ bypass, blocked ruler, footer note, 4 snapshots) → `it("Reject a replacement expiration that would leave the short call uncovered — on the short's expiration")`
    - AC-7b: Outline expiration < short (+ bypass) → `it("Reject a replacement expiration that would leave the short call uncovered — before the short's expiration")`
    - AC-8: Allow a replacement that shortens coverage but still outlasts the short call → `it('Allow a replacement that shortens coverage but still outlasts the short call')`
    - AC-9: Reject a roll that changes neither strike nor expiration → `it('Reject a roll that changes neither strike nor expiration')`
    - AC-10a: Outline proceeds $0.00 → `it('Reject non-positive proceeds from close')`
    - AC-10b: Outline debit $0.00 → `it('Reject non-positive replacement debit')`
    - AC-11: Roll the LEAPS while no short call is open → `it('Roll the LEAPS while no short call is open')`
    - AC-12: Leave a classic wheel unaffected → `it('Leave a classic wheel unaffected')`
  - Assertions must be falsifiable (two opposite fixtures where one could pass by accident)
  - Run `pnpm test:e2e e2e/pmcc-leaps-roll.spec.ts` — new tests must fail only if the feature is missing; if they already pass, verify each assertion is falsifiable
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - Fix any wiring gaps revealed; existing specs (`pmcc-short-call-roll`, `pmcc-cost-basis`, `cc-roll`, `open-pmcc-position`, `position-cockpit`) must still pass
  - Run `pnpm test:e2e` — all tests must pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Consider: keep `fieldError` / `confirmButton` / `rollSheet` generic in `pmcc-roll-helpers.ts`; per-sheet openers/fillers named by sheet

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] Core-engine areas have property tests (Area 1 `pmcc-rules.property.test.ts`, Area 2 `lifecycle.property.test.ts`)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC (15 rows, one `it` each)
- [ ] `pnpm rebuild:node && pnpm test && pnpm lint && pnpm typecheck` — all clean
- [ ] `/update-spec us-105` once the story completes
