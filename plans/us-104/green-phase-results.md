## Area 1 — Shared coverage comparator (Green)

- `src/main/core/pmcc-rules.ts`: exported `SHORT_NOT_BEFORE_LONG` (`as const satisfies Pick<PmccIssue, 'code' | 'message'>`) and `shortExpiresBeforeLeaps`; `pmccCrossLegIssues` uses both, so the message exists once
- `pnpm test src/main/core/pmcc-rules`: 19/19 pass; `pnpm test src/main/core`: 798/798 pass

## Area 4 — Payload schema and result type

- `src/main/schemas.ts` (roll-types region only): `RollResultBase` is now an exported interface (the type test asserts `RollPmccShortCallResult` extends it); added `RollPmccShortCallPayloadSchema = RollPayloadBaseSchema`, `RollPmccShortCallPayload = z.infer<…>`, and `RollPmccShortCallResult extends RollResultBase` with `position.phase: 'PMCC_OPEN'`, `costBasisSnapshot: CostBasisSnapshotRecord & { triggerEvent: 'PMCC_SHORT_ROLL'; finalPnl: null }`, `ledger: PmccLedgerResult` (from `core/costbasis`, already imported), `shortCallRollNumber: number`.
- `pnpm vitest run src/main/schemas` → 75 passed. `pnpm typecheck` → only Area 3's in-flight `pmccOpenLegs` errors remain; none from Area 4. ESLint + Prettier clean on both files.
- Tech debt for Refactor: the three roll results repeat the `position: { id; ticker; phase; status: 'ACTIVE' }` block, differing only by phase literal.

## Area 3 — Open-leg selectors and `pmccOpenLegs` on `positions:get`

- `src/main/services/pmcc-ledger.ts` — `newestLongBuy` renamed and exported as `currentLeapsLeg`;
  new `currentShortCallLeg` (a `reduce` over non-roll legs merged with `groupRollChains` events in
  `byFillThenCreated` order), `PmccOpenLegs`, `pmccOpenLegs`
- `src/main/services/get-position.ts` — `pmccOpenLegs: isPmcc ? pmccOpenLegs(legs) : null`
- `src/main/schemas.ts` — `GetPositionResult.pmccOpenLegs: PmccOpenLegs | null` (type imported
  from the service module)
- `src/renderer/src/api/positions.ts` — re-exports `PmccOpenLegs`
- Renderer fixtures gain `pmccOpenLegs: null`: `PositionCockpit.spec.tsx`,
  `PositionDetailContent.test.tsx`, `PositionDetailPage.test.tsx`

Result: `pnpm test src/main/services src/main/ipc src/renderer` green (6 IPC first-case timeouts
under parallel load in the combined run; all 250 ipc/ledger/get-position tests pass in isolation).
`pnpm typecheck` clean.

Tech debt for refactor: `contributionsFrom`, `currentLeapsLeg` and `currentShortCallLeg` each merge
non-roll legs with chains and sort by fill then created.

## Area 2 — Pure lifecycle rule set `rollPmccShortCall` (Green)

- `src/main/core/lifecycle.ts`: `RollPmccShortCallInput`, `RollPmccShortCallResult`, `rollPmccShortCall` — the eight research.md rules in order, first failure throws; reuses `requirePositiveDecimal`, `requirePositiveStrike(…, 'newStrike')`, `shortExpiresBeforeLeaps` + `SHORT_NOT_BEFORE_LONG` (code and message taken from the constant); rule 7 date via `format(parseISO(…), 'MMM d, yyyy')`; strike equality via `Decimal.eq`. No logging, no I/O
- `pnpm test src/main/core/lifecycle`: 186/186 pass

## Area 7 — Renderer pure helpers and the form schema (Green)

- `src/renderer/src/lib/pmcc-roll.ts` (new): `PmccRollNet`, `pmccRollNet`, `PmccRollLabelInput`, `pmccRollLabel`, `pmccPostRollEffectiveCost`, `pmccStrikeShortfall`. `Decimal` math, display via `toFixed(2, ROUND_HALF_UP)`; cash inputs via `parsePositiveInputDecimal` (zero / mid-edit → `null`); months via `format(parseISO(d), 'MMM' | 'MMM d')` with `isSameMonth` choosing the day form; strikes via `Decimal.toString()`
- `src/renderer/src/schemas/roll-pmcc-short-call.ts` (new): `RollPmccShortCallContext`, `rollPmccShortCallSchema(ctx)` (object schema + `superRefine`: coverage via `shortExpiresBeforeLeaps` / `SHORT_NOT_BEFORE_LONG` → `newExpiration`, else earlier-than-current → `newExpiration` with `MMM d, yyyy`; no-change (Decimal strike equality + same date) → `__roll__`; all skipped while the expiration is not ISO), `RollPmccShortCallFormValues`, `EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today)`, `toRollPmccShortCallPayload(values, positionId): RollPmccShortCallPayload`
- Payload type: the main `RollPmccShortCallPayload` from `src/main/schemas.ts` (the renderer already imports `CreatePmccPositionPayload` the same way in `pmcc-entry.ts`); no casts. Area 6 re-points it at the renderer alias.
- Deviation: `moneySchema` duplicated privately from `pmcc-entry.ts` (refactor candidate); `required` not needed — `''` fails `moneySchema` with the field's own message.
- `pnpm test src/renderer/src/lib/pmcc-roll src/renderer/src/schemas/roll-pmcc-short-call` → 2 files, 42 passed. ESLint on the four files clean; `pnpm typecheck` clean.
- Tech debt: duplicated `moneySchema`; the earlier-than-current check compares ISO strings (same basis as `shortExpiresBeforeLeaps`).

## Area 5 — `rollPmccShortCallPosition` service (Green)

- `src/main/services/roll-pmcc-short-call-position.ts` (new):
  ```ts
  export function rollPmccShortCallPosition(
    db: Database.Database,
    positionId: string,
    payload: RollPmccShortCallPayload
  ): RollPmccShortCallResult
  ```
  Flow: `getPosition` (→ `not_found`) → `detail.pmccOpenLegs` (already computed by `getPosition`) → 4-dp `money4`, `newStrike ?? openShort.strike` → `rollPmccShortCall({ openShort: short /* may be null */, leapsExpiration: long.expiration, … })` → one `db.transaction`: insert `ROLL_FROM` (BUY, open short's strike/exp/contracts, premium = fill = cost) and `ROLL_TO` (SELL, replacement, premium = fill = new premium), shared `roll_chain_id`, `fees '0.0000'`, then `appendPmccSnapshot(…'PMCC_SHORT_ROLL'…)`. Position row untouched. `shortCallRollNumber` = prior BUY-from chains + 1.
- Logging: DEBUG `roll_pmcc_short_call_inputs`, `roll_pmcc_short_call_tx_start` / `_tx_committed`; INFO `pmcc_short_call_rolled { positionId, rollChainId, netCreditPerShare, basisPerShare, shortCallRollNumber }`; INFO `pmcc_short_roll_rejected { positionId, field, code }` from a thin outer wrapper around `recordRoll`.
- Deviations:
  - **No open short** reaches the engine (`openShort: null`), so the rejection is the engine's `__root__` / `no_open_short_call` / `This PMCC has no open short call to roll.` — not tasks.md's `no_active_leg`. `no_active_leg` is kept only for a PMCC_OPEN row with no LEAPS at all (unreachable via the app).
  - **Wheel id**: `pmccOpenLegs` is `null` for a non-PMCC, so `requireOpenLegs` reports `__phase__` / `invalid_phase` (`Position is not in PMCC_OPEN phase`, the engine's wording) before `no_active_leg` — the engine cannot be reached without a LEAPS expiration.
  - Not re-exported from `services/positions.ts`: `rollCcPosition` is imported directly by `ipc/positions.ts`, so Area 6 should do the same.
- `pnpm test src/main/services` → 50 files / 839 passed; `pnpm lint` clean; `pnpm typecheck` clean.
- Tech debt for Refactor: the leg INSERT SQL is the fifth copy (`create-pmcc-position.ts`, `ipc/test-pmcc-ledger.ts`, `test-fixtures/pmcc-legs.ts`, wheel roll services); the post-engine `short === null` narrowing guard and the moot `?? 0` strike fallback exist only because the engine owns the null-short rule; `money4` duplicated from `create-pmcc-position.ts`; `openPayload` / `recordLegEvent` test helpers duplicated between the new test and `pmcc-cost-basis-chain.test.ts`.

## Area 6 — IPC handler, preload, renderer adapter and hook (Green)

- `src/main/ipc/positions.ts`: one `registerParsedPositionHandler(db, 'positions:roll-pmcc-short', 'positions_roll_pmcc_short_unhandled_error', RollPmccShortCallPayloadSchema, rollPmccShortCallPosition)`; the service imported directly from `../services/roll-pmcc-short-call-position` (as `rollCcPosition` is)
- `src/preload/index.ts`: `rollPmccShortCall: (payload: unknown) => invoke('positions:roll-pmcc-short', payload)`
- `src/preload/index.d.ts`: `IpcRollPmccShortCallResult = IpcResult<RollPmccShortCallResult>`; `rollPmccShortCall: (payload: RollPmccShortCallPayload) => Promise<IpcRollPmccShortCallResult>`
- `src/renderer/src/api/positions.ts`: `RollPmccShortCallPayload = IpcPayload<'rollPmccShortCall'>`, `RollPmccShortCallResponse = IpcSuccess<'rollPmccShortCall'>`, `rollPmccShortCall()` (same body as `rollCc`)
- `src/renderer/src/hooks/useRollPmccShortCall.ts` (new): `useRollPmccShortCall(options?)` over `usePositionMutation`, mirroring `useRollCc`. No hook test — `useRollCc` has none.
- `src/renderer/src/schemas/roll-pmcc-short-call.ts`: `toRollPmccShortCallPayload` now returns the renderer `RollPmccShortCallPayload` (imported from `../api/positions`, precedent `screening-criteria.ts`)
- `pnpm vitest run` on the two test files + `roll-pmcc-short-call` → 86/86; `pnpm typecheck` clean. No casts, no mapping.

## Area 9 — `Roll Short Call` sheet, coverage ruler, sheet state, page wiring, banner, leg reference (Green)

- New:
  - `src/renderer/src/hooks/useRollPmccShortCallForm.ts` — `useForm({ mode: 'onChange', resolver: zodResolver(rollPmccShortCallSchema(ctx)), defaultValues: EMPTY_…(today) })`; shared by the sheet and the form test's harness
  - `src/renderer/src/components/PmccCoverageRuler.tsx` — DTE via `computeDteFromInput(d, parseISO(today))`; `left`/`width` percentages of the LEAPS DTE (the only inline styles); `blocked` derived from the dates (`!shortExpiresBeforeLeaps` or before the current short) rather than a prop
  - `src/renderer/src/components/RollPmccShortCallForm.tsx` — mockup `RollShortSheet` order (minus US-114's IV context): `SheetHeader`, `Coverage`, `Current short call`, `Replacement short call` grid, net preview, warning, `__roll__` / `root.save` alerts, footer. `useFormContext` + `useWatch`; the no-change rule is re-run on strike/expiration changes via RHF `deps: '__roll__'` (onChange validation only updates the changed field's error, so `__roll__` would otherwise never surface)
  - `src/renderer/src/components/PmccRollNetPreview.tsx` — placeholder or the `Net` card (split out of the form)
  - `src/renderer/src/components/RollPmccShortCallSheet.tsx` — portal + `SheetPanel width={440}` + `role=dialog` (Escape scoped to the dialog, as `NewPositionSheet`); `useRollPmccShortCall({ onSuccess: onRecorded })`; `inFlight` ref guards double submit; `showRollErrors` maps `costToClosePerContract → costToClose`, `newPremiumPerContract → newPremium`, `newStrike`, `newExpiration`, `__roll__`, else `root.save` (`Could not record the roll. Your entries are preserved. Try again.`)
  - `src/renderer/src/components/PmccRollRecordedBanner.tsx` — `AlertBox success` `pmcc-roll-recorded-banner` from `rollFromLeg`, `rollToLeg`, `shortCallRollNumber`, `pmccRollNet`
- Modified: `usePositionDetailSheets.ts` (`rollPmccShortOpen`, `handleRollPmccShort` clears the banner, `handleCloseRollPmccShort`, `pmccRollRecorded`, `handlePmccRollRecorded`; `overlayOpen` includes the sheet); `PositionDetailPage.tsx` (wires `onRollPmccShort`, banner above the content, mounts the sheet when `rollPmccShortOpen && pmccOpenLegs?.short && pmccLedger?.effectiveShareCost`); `PmccLegReference.tsx` (`openLegs: PmccOpenLegs`, fixed headers); `PositionCockpit.tsx` (passes `detail.pmccOpenLegs`, renders the reference only when non-null)
- Deviations:
  - Confirm `disabled` is `!schema.safeParse(watchedValues).success`, not RHF `!isValid`: RHF's `setError` forces `isValid: false`, so a `root.save` failure would disable the very retry its message invites
  - The warning and the roll label render only once the roll is valid (mockup `valid` gate); the footer's blocked note shows whenever the expiration carries an error (mockup `blocked`)
  - Sheet mount also requires `pmccLedger.effectiveShareCost` (typed `string | null`)
  - Dates render ISO (`2026-11-20`) as in the mockup; the button label is `Confirm roll` per tasks.md (mockup: `Confirm Roll`)
  - The warning keeps the mockup's trailing `You can still record it.`
- `pnpm vitest run src/renderer` → 162 files / 1847 passed; `pnpm typecheck` clean; `pnpm lint` clean.
- Tech debt for Refactor: `showRollErrors` vs `PmccEntryForm#showSaveErrors`; the schema is built in both `useRollPmccShortCallForm` and the form (for the confirm gate); `DatePicker` input mock duplicated across the two new test files.

## Area 10 — E2E tests (Green)

- Test code only; no app changes. `pnpm rebuild:electron`, then `pnpm test:e2e` (full, with build) → 40 files / 455 passed, 1 todo; includes `cc-roll.spec.ts`, `pmcc-cost-basis.spec.ts`, `open-pmcc-position.spec.ts`, `position-cockpit.spec.ts` unchanged and green, and all 12 `pmcc-short-call-roll.spec.ts` cases.
- Observation (not an AC, not changed): the roll service accepts a `fillDate` earlier than the open short call's own fill date; the snapshot then sorts before the short it closes.
- The classic CC roll sheet has no `role=dialog`; the regression test reads the portalled overlay (`sheet-scrim`'s parent).
