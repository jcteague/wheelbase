---
story: us-117
kind: bugfix
parent: us-34
topics: [market-data, position-cockpit]
status: planned
---

# Implementation Plan: US-117 — A position's implied volatility is a real number or an honest dash, never NaN

## Summary

The position cockpit's Context strip renders `NaN%` for IV because the preload and renderer
type mirrors still declare a required `greeks.iv` that no producer has ever written, while
the real figure — `impliedVolatility`, already correct in the main process and already
crossing the IPC at runtime — is invisible to the renderer because no type declares it. This
story deletes `greeks.iv` from all three type declarations, adds `impliedVolatility` as a
sibling of `greeks`, hardens the Alpaca mapper so a non-finite figure is dropped rather than
stringified as `"NaN"`, routes every renderer parse through one finite-guard helper, and
makes the Context strip's IV cell render `—` instead of `NaN%`. The strip's existing
render gate is deliberately left alone, preserving US-34's shipped behaviour. Done means the
IV cell shows `28.4%` when Alpaca supplies it, `—` when it does not, and `NaN%` is
unreachable from any of the five figures.

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API
contract:

- **User Story & Acceptance Criteria:** Linear [OPT-10](https://linear.app/optionswheel/issue/OPT-10/us-117-a-positions-implied-volatility-is-a-real-number-or-an-honest) (archive copy: `docs/epics/06-stories/US-117-position-implied-volatility.md`)
- **Research & Design Decisions:** `plans/us-117/research.md`
- **Data Model & Display Rules:** `plans/us-117/data-model.md`
- **API Contracts:** `plans/us-117/contracts/market-data-option-snapshots.md`, `plans/us-117/contracts/market-data-option-snapshot.md`
- **Quickstart & Verification:** `plans/us-117/quickstart.md`

## Prerequisites

Most of the main-process half already exists on `wb-ivr-fixes` — read
`research.md` §"Verified current state" before assuming the story's diagnosis is accurate.
Specifically, these are **already done** and must not be redone:

- `OptionSnapshot` in `src/main/integrations/market-data-provider.ts:35` already has optional
  `greeks` and a top-level `impliedVolatility?: string`
- `mapOptionQuote` (`alpaca-market-data-mappers.ts:145`) already populates it
- `CockpitInput.impliedVolatility` already exists (as optional) and `ContextStrip.tsx:37`
  already prefers it over `greeks.iv`
- `docs/spec/domain/market-data.md:251-269` already documents the target shape

No migration, no schema change, no new dependency.

## Implementation Areas

### 1. Producer hardening — non-finite figures are dropped, not stringified

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data-mappers.ts` — swap the two `typeof === 'number'`
  predicates for `Number.isFinite`, and export a new pure `nonFiniteFigures`
- `src/main/integrations/alpaca-market-data.test.ts` — mapper cases live here

**Red — tests to write** (all in `src/main/integrations/alpaca-market-data.test.ts`, beside
the existing `omits impliedVolatility when Alpaca does not supply it` at `:729`):

- `mapOptionQuote omits impliedVolatility when Alpaca sends NaN` — build an
  `AlpacaOptionSnapshot` with `impliedVolatility: NaN`; assert the result does **not** have
  the property. This fails today: `typeof NaN === 'number'` is true, so the current code
  emits `impliedVolatility: 'NaN'`.
- `mapOptionQuote omits impliedVolatility when Alpaca sends Infinity` — same assertion.
- `mapOptionQuote omits the whole greeks block when any greek is NaN` — a `greeks` object with
  finite delta/gamma/theta and `vega: NaN`; assert `result.greeks` is `undefined`, not a
  three-field object and not one containing `'NaN'`. Repeat as a loop over all four field
  names so each Greek is covered.
- `mapOptionQuote keeps a legitimate zero` — `impliedVolatility: 0` and a `greeks` block with
  `delta: 0`; assert both survive as `'0.0000'`. Guards against a truthiness check being used
  instead of `Number.isFinite`.
- `nonFiniteFigures returns [] for a clean snapshot` and `… for a snapshot that omits both
blocks` — absence is not a defect.
- `nonFiniteFigures names impliedVolatility when it is NaN` — assert
  `['impliedVolatility']`.
- `nonFiniteFigures names each non-finite greek` — a snapshot with `delta: NaN` and
  `vega: Infinity` returns `['greeks.delta', 'greeks.vega']`.

**Green — implementation:**

- In `isCompleteGreeks` (`alpaca-market-data-mappers.ts:104`), replace the four
  `typeof g.X === 'number'` checks with `Number.isFinite(g.X)`.
- In `mapOptionQuote` (`:145`), replace `typeof snap.impliedVolatility === 'number'` with
  `Number.isFinite(snap.impliedVolatility)`.
- Add `export function nonFiniteFigures(snap: AlpacaOptionSnapshot): string[]` returning the
  dotted names of fields that are present as numbers but not finite — signature and exact
  return values in `data-model.md` §3. Keep it pure: no logger import in this file, which its
  own header at `:1-4` promises ("No I/O — every function here is total and side-effect
  free").

**Refactor — cleanup to consider:**

- The four-field `Number.isFinite` repetition in `isCompleteGreeks` and the field walk in
  `nonFiniteFigures` want the same `['delta','gamma','theta','vega']` tuple — declare it once
  as a module const rather than spelling the names twice.
- Check the comment at `:133-134` still describes the rule accurately now that "partial" also
  means "non-finite".

**Acceptance criteria covered:**

- "A malformed figure is treated as absent" — the drop half.
- "Scenario Outline: No Greek renders as NaN" — the producer half, for all four fields.

---

### 2. Adapter warn log

**Files to create or modify:**

- `src/main/integrations/alpaca-market-data.ts` — log at `getOptionSnapshot` (`:162`)
- `src/main/integrations/alpaca-market-data.test.ts`

**Red — tests to write:**

- `getOptionSnapshot logs a warn naming the dropped field` — stub the fetch to return a
  snapshot whose `impliedVolatility` is `NaN`, spy on the pino logger, and assert one
  `logger.warn` call with `{ contract, fields: ['impliedVolatility'] }` and the event name
  `'option_snapshot_non_finite_figure'`.
- `getOptionSnapshot does not warn for a snapshot that merely omits impliedVolatility` — an
  absent figure is the normal case (`contracts: 161, withGreeks: 87`); assert zero `warn`
  calls. This is the assertion that keeps the log from becoming noise.
- `getOptionSnapshot still returns the mapped snapshot when it warns` — a bad IV must not
  fail the read; assert `bid`/`ask`/`mid` are intact and `impliedVolatility` is absent.

**Green — implementation:**

- In `AlpacaMarketDataProvider.getOptionSnapshot`, call `nonFiniteFigures(snap)` before
  `mapOptionQuote(snap)` and, when the array is non-empty, emit
  `logger.warn({ contract: contractId, fields }, 'option_snapshot_non_finite_figure')`.
  Follow the shape of the existing `logger.warn` at `:256`
  (`alpaca_open_interest_unavailable`).
- Do **not** add the call to `getOptionChainSnapshot` — see `research.md` ADR 3 for why.

**Refactor — cleanup to consider:**

- Confirm the event name reads like its neighbours (`alpaca_chain_key_unparseable`,
  `alpaca_open_interest_unavailable`) — consider `alpaca_option_snapshot_non_finite_figure`
  for prefix consistency and settle on one spelling across the contract doc and the test.

**Acceptance criteria covered:**

- "A malformed figure is treated as absent … **And the malformed value is logged at warn
  level**".

---

### 3. Make the IPC type mirrors tell the truth

**Files to create or modify:**

- `src/preload/index.d.ts` — `IpcOptionSnapshot` at `:243`
- `src/renderer/src/api/market-data.ts` — `OptionGreeks` / `OptionSnapshot` at `:21`
- Fixtures that spell `greeks: { …, iv }`: `src/renderer/src/hooks/useOptionSnapshots.test.ts:41`,
  `src/renderer/src/hooks/usePromotedQuote.test.ts:55`,
  `src/renderer/src/components/PositionCard.test.tsx:53`,
  `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx:74`

**Red — tests to write:**

- The compiler is the test here. Add a type-level assertion in
  `src/renderer/src/hooks/useOptionSnapshots.test.ts` that an `OptionSnapshot` literal with
  **no** `greeks` key and **no** `impliedVolatility` key type-checks, and that one carrying
  `impliedVolatility: '0.2840'` alongside `greeks` type-checks. Both fail `pnpm typecheck`
  today — `greeks` is required and `impliedVolatility` does not exist.
- `useOptionSnapshots returns a snapshot that carries impliedVolatility` — extend the existing
  fixture at `:41` so the hook's resolved data exposes the field; asserts the value survives
  the `api/market-data.ts` boundary rather than being erased by the cast at
  `getOptionSnapshots`.

**Green — implementation:**

- In `src/preload/index.d.ts:243`, change `greeks` to optional, delete `iv` from it, and add
  `impliedVolatility?: string`. The table in `data-model.md` §1 gives the exact before/after.
- Mirror the same three edits on `OptionGreeks` and `OptionSnapshot` in
  `src/renderer/src/api/market-data.ts:21`.
- Move `iv: '…'` out of every fixture's `greeks` object into a sibling
  `impliedVolatility: '…'`. Do not simply delete it — several of these fixtures exist to prove
  the value reaches a component.

**Refactor — cleanup to consider:**

- These two files are hand-maintained copies of
  `src/main/integrations/market-data-provider.ts` with no structural link, which is the direct
  cause of this defect. Adding a link is out of scope, but leave a comment on each pointing at
  the source-of-truth type so the next drift is at least visible, and note the duplication for
  a follow-up.

**Acceptance criteria covered:**

- Foundation for all six scenarios — without this the renderer cannot see the figure at all.

---

### 4. One finite-parse helper at the renderer edge

**Files to create or modify:**

- `src/renderer/src/lib/format.ts` — add `parseFinite`
- `src/renderer/src/lib/format.test.ts`

**Red — tests to write** (in `src/renderer/src/lib/format.test.ts`):

- `parseFinite returns the number for a well-formed decimal string` — `'0.2840'` → `0.284`,
  `'-0.05'` → `-0.05`.
- `parseFinite returns 0 for '0'` — explicitly asserts a legitimate zero is **not** nulled.
  This is the case `parseFloat(x) || null` at `PositionCockpit.tsx:232` gets wrong, and zero
  is a valid delta.
- `parseFinite returns null for undefined, null and the empty string`.
- `parseFinite returns null for the string 'NaN'` — the exact value the hardened mapper now
  prevents, guarded a second time at the edge.
- `parseFinite returns null for 'abc' and for 'Infinity'`.
- `parseFinite never returns NaN` — assert `Number.isNaN(result) === false` across the whole
  table above, which is the property the component actually depends on.

**Green — implementation:**

- Add `export function parseFinite(value: string | null | undefined): number | null` to
  `src/renderer/src/lib/format.ts`, returning `null` for nullish or empty input and for any
  `parseFloat` result that fails `Number.isFinite`. Signature and the full input/output table
  are in `data-model.md` §4.

**Refactor — cleanup to consider:**

- `fmtMoney`, `pnlColor` and `pnlClass` in the same file all call bare `parseFloat` on
  strings that come from the same IPC boundary. Note them; converting them is a behaviour
  change (`fmtMoney(undefined)` currently yields `"$NaN"`) and belongs to its own story, not
  this one. Mention, do not change.

**Acceptance criteria covered:**

- Second line of defence for "A malformed figure is treated as absent" and the Scenario
  Outline.

---

### 5. `buildCockpitInput` carries implied volatility and cannot emit NaN

**Files to create or modify:**

- `src/renderer/src/lib/verdict.ts` — `CockpitInput` at `:19`
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` — `buildCockpitInput` at `:225-241`
- `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`
- Inline `CockpitInput` literals that will stop compiling: `src/renderer/src/lib/verdict.spec.ts`,
  `src/renderer/src/components/position-cockpit/RiskSnapshot.spec.tsx:20`,
  `src/renderer/src/components/position-cockpit/VerdictBlock.spec.tsx:27`

**Red — tests to write** (in `PositionCockpit.spec.tsx`):

- `passes impliedVolatility from the snapshot into the cockpit input` — render
  `PositionCockpit` with a snapshot carrying `impliedVolatility: '0.2840'` and assert the
  Context strip shows `28.4%`. Fails today because `buildCockpitInput` never reads the field.
- `sets impliedVolatility to null when the snapshot omits it` — assert the IV cell shows `—`.
- `sets impliedVolatility to null when the snapshot carries 'NaN'` — the regression case;
  assert the cell shows `—` and that the string `NaN` appears nowhere in the rendered output.
- `sets impliedVolatility to null when there is no snapshot at all` — render with
  `snapshot={undefined}`; assert no `NaN` is rendered. The strip itself is absent here
  (no Greeks → US-34's gate), so assert on the absence of `NaN`, not on a dashed cell.
- `nulls the whole greeks block when one greek parses to NaN` — a snapshot whose
  `greeks.vega` is the string `'NaN'`; assert the strip does not render and no `NaN` reaches
  the output. All-or-nothing, per `research.md` ADR 4.
- `keeps a zero-valued figure` — `greeks.delta: '0'`; assert the strip **does** render, i.e.
  a legitimate zero is not mistaken for absence. This is the case `parseFloat(x) || null`
  gets wrong.

**Green — implementation:**

- In `src/renderer/src/lib/verdict.ts:19`, delete `iv?: number` from the `greeks` member type
  and change `impliedVolatility?: number | null` to the required `impliedVolatility: number | null`.
  Required-and-nullable is deliberate — it makes `buildCockpitInput` fail to compile until it
  decides, which is the inverted form of the original bug (`research.md` ADR 2).
- In `buildCockpitInput` (`PositionCockpit.tsx:229`), route all six figures through
  `parseFinite`: the four Greeks, `currentMid`, and `underlying` — replacing the hand-rolled
  `parseFloat(underlyingPrice) || null` at `:232`, which swallows a legitimate `0`.
- Add `impliedVolatility: parseFinite(snapshot?.impliedVolatility)` as a sibling of `greeks`
  in the returned object. Delete the `iv: parseFloat(snapshot.greeks.iv)` line at `:239`.
- Keep `greeks` all-or-nothing: build the block only when `snapshot?.greeks` exists, and if
  any of the four `parseFinite` results is `null`, set `greeks` to `null` rather than emitting
  a partial object (`research.md` ADR 4).
- Update the inline `CockpitInput` literals in `verdict.spec.ts`, `RiskSnapshot.spec.tsx` and
  `VerdictBlock.spec.tsx` that `pnpm typecheck` names — move `iv` out of `greeks`, add
  `impliedVolatility`.

**Refactor — cleanup to consider:**

- The four-Greek parse-then-null-if-any-null shape wants to be a small local function rather
  than an inline ternary chain; name it for the rule it encodes (all-or-nothing), not for its
  mechanics.
- Check no consumer still reads `input.greeks.iv` — `grep -rn "greeks\.iv" src/` must come
  back empty.

**Acceptance criteria covered:**

- "The contract's implied volatility is shown as a percentage" (the mapping half)
- "A contract the provider has no implied volatility for reads as absent"
- "A malformed figure is treated as absent" (the display half)
- "Scenario Outline: No Greek renders as NaN" (the renderer half)

---

### 6. Context strip's IV cell dashes instead of rendering NaN

**Files to create or modify:**

- `src/renderer/src/components/position-cockpit/ContextStrip.tsx`
- `src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx`

**Red — tests to write** (in `ContextStrip.spec.tsx`):

- **Rewrite `renders — for IV when impliedVolatility is null` at `:155`** so it asserts the
  `NaN` path its own comment at `:157` names, not just the `null` path: pass
  `impliedVolatility: NaN` as well as `null` and assert `—` in both, and that the rendered
  output contains no `NaN`. Drop the `as unknown as CockpitInput` cast — once `greeks.iv` is
  gone from the type, the fixture is legal without it.
- `renders IV as a one-decimal percentage` — `impliedVolatility: 0.284` → `28.4%`. The
  existing `:67` case moves off `greeks.iv = 0.32` onto the sibling field.
- `renders the IV cell as — while the Greek cells still show values` — full `greeks`,
  `impliedVolatility: null`; assert Theta, Vega and Gamma all render real numbers alongside
  the dash. This is the assertion that proves IV dashes _independently_ rather than taking
  the strip down with it.
- `IV sub-label still reads "implied vol" when the cell is dashed` — and `rank {n}` when
  `ivRank` is passed; the sub-label is not part of the defect and must not change.
- `dashed IV cell takes the default text colour` — assert `text-wb-text-primary`, not a
  severity token.

**Leave green and untouched:** `renders null when greeks are absent` at `:39`. That is
US-34's behaviour and this story preserves it (`research.md` ADR 5). Same for the existing
colour, `ivRank` and `bg-wb-bg-surface` token cases.

**Green — implementation:**

- Keep both early returns at `:27` and `:31` exactly as they are.
- Replace the fallback at `:37-38`
  (`input.impliedVolatility !== undefined ? … : (input.greeks.iv ?? null)`) with a direct read
  of `input.impliedVolatility`, which after area 5 is required-and-nullable — so the
  `!== undefined` dance and the `greeks.iv` fallback both go.
- Keep the formatter as `iv != null ? \`${(iv \* 100).toFixed(1)}%\` : '—'`. It is now correct
because `parseFinite`(area 4) guarantees the field is a finite number or`null`— the value
that used to sail through this guard,`NaN`, can no longer reach it. Exact rules in
`data-model.md` §5.
- Nothing else in the component changes. Tailwind `wb-*` tokens only, no inline styles.

**Refactor — cleanup to consider:**

- With the fallback gone the `iv` local may be a needless indirection — inline it if it reads
  better, leave it if the name earns its place.
- Confirm `grep -rn "greeks\.iv" src/` is empty at the end of this area; this file was the
  last production reader.

**Acceptance criteria covered:**

- "A contract the provider has no implied volatility for reads as absent"
- "A malformed figure is treated as absent" (the display half)
- "The contract's implied volatility is shown as a percentage" (the formatting half)

---

### 7. E2e tests

**Files to create or modify:**

- `e2e/position-cockpit.spec.ts` — the `SNAP_HOLD` fixture at `:57`, the US-34 IV case at
  `:575`, plus the new US-117 cases

**Red — tests to write.** First fix the fixture: `SNAP_HOLD` at `:57` still spells
`greeks: { …, iv: '0.25' }`; move that to a sibling `impliedVolatility: '0.2500'` or every IV
assertion below reads a dash. Then, one case per AC, named in the AC's own language:

- `US-117 AC: the contract's implied volatility is shown as a percentage` — seed
  `{ [OCC_30D]: { ...SNAP_HOLD, impliedVolatility: '0.2840' } }`, open the position detail,
  assert the IV cell reads exactly `28.4%`. Assert against the IV cell specifically, not a
  page-wide `:has-text`, so a coincidental `28.4%` elsewhere cannot satisfy it.
- `US-117 AC: a contract the provider has no implied volatility for reads as absent` — seed
  full `greeks` and **no** `impliedVolatility`; assert the IV cell reads `—`, that the Theta
  cell still shows a real figure (so the dash is IV's alone), and that `NaN` appears nowhere
  on the page. Paired with the case above, one fixture proves the number appears and the
  other proves the dash does — neither can pass by accident.
- `US-117 AC: a newly added position shows its implied volatility without waiting` — seed the
  snapshot, create the position **through the UI in this test** rather than from a pre-seeded
  DB, open its detail page, and assert `28.4%` on first render without advancing the 60 s
  poll interval. `useOptionSnapshots` keys on the position's own OCC symbol and fires on
  mount, so this must hold with no waiting; the assertion is that it does.
- `US-117 AC: no snapshot at all reads as absent, not broken` — launch with `{}` snapshots;
  assert the Context strip is absent (`:text-is("IV")` count is 0) **and** that `NaN` appears
  nowhere on the page, and that the cockpit itself still rendered (`Awaiting market data`
  verdict visible) so "absent" cannot be satisfied by a blank page or a crash. This is the AC
  read as _nothing broken is shown_ — see `research.md` ADR 5.
- `US-117 AC: a malformed figure is treated as absent` — seed full `greeks` and
  `impliedVolatility: 'NaN'`; assert the IV cell reads `—`. The warn-level half of this AC is
  asserted in area 2's main-process test, the only layer that can observe the logger — say so
  in a comment on this test so the split reads as deliberate.
- `US-117 AC: delta that cannot be parsed renders no NaN` — seed
  `greeks: { …, delta: 'NaN' }`; assert the strip is absent (all-or-nothing Greeks) and that
  `NaN` appears nowhere on the page. Same shape for `theta`, `gamma`, `vega` — four cases,
  one per Scenario Outline row, each naming its field so a failure identifies it.

Also update, do not delete, `US-34 AC: IV displayed as XX.X% not decimal` at `:575` so it
reads the value off `impliedVolatility` instead of `greeks.iv`.

**Leave green and untouched:** `US-34 AC: Greeks unavailable — ContextStrip absent, no error
alert` at `:592`, and `US-34 AC: HOLDING_SHARES — ContextStrip and RiskSnapshot not rendered`
at `:612`. Both describe behaviour this story preserves, and they are the proof that the IV
fix did not disturb the strip's gating.

**Green — implementation:**

- No production code. Every case above should pass on the work from areas 1–6; any that does
  not is a real gap in those areas, not a test to weaken.

**Refactor — cleanup to consider:**

- The four Scenario-Outline cases differ only in which Greek is poisoned — drive them from a
  `['delta','theta','gamma','vega']` table, but keep one `it` per field so a failure names the
  field.
- Add a `contextCell(page, label)` locator helper if the IV/Theta assertions repeat the same
  DOM walk; a page-wide text match would let a fallback satisfy these assertions by accident.
- The "no `NaN` anywhere on the page" assertion recurs in four cases — extract it once.

---

## AC Audit

| #   | Acceptance criterion                                                 | E2e case in area 7                                                                 | Also unit-covered                               |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | The contract's implied volatility is shown as a percentage → `28.4%` | `US-117 AC: the contract's implied volatility is shown as a percentage`            | areas 5, 6                                      |
| 2   | A contract with no implied volatility reads `—`, not `NaN%`          | `US-117 AC: a contract the provider has no implied volatility for reads as absent` | areas 5, 6                                      |
| 3   | A newly added position shows its IV without waiting                  | `US-117 AC: a newly added position shows its implied volatility without waiting`   | —                                               |
| 4   | No snapshot at all reads `—` †                                       | `US-117 AC: no snapshot at all reads as absent, not broken`                        | area 6 (`:39`, unchanged)                       |
| 5   | A malformed figure reads `—` **and is logged at warn level**         | `US-117 AC: a malformed figure is treated as absent` (display half)                | areas 1, 4, 5; **warn half asserted in area 2** |
| 6a  | Outline — `delta` unparseable → Delta cell `—` †                     | `US-117 AC: delta that cannot be parsed renders no NaN`                            | areas 1, 5                                      |
| 6b  | Outline — `theta` unparseable → Theta cell `—` †                     | `US-117 AC: theta that cannot be parsed renders no NaN`                            | areas 1, 5                                      |
| 6c  | Outline — `gamma` unparseable → Gamma cell `—` †                     | `US-117 AC: gamma that cannot be parsed renders no NaN`                            | areas 1, 5                                      |
| 6d  | Outline — `vega` unparseable → Vega cell `—` †                       | `US-117 AC: vega that cannot be parsed renders no NaN`                             | areas 1, 5                                      |

No acceptance criterion is uncovered. Two qualifications, both deliberate and both recorded
in `research.md` ADR 5:

**† Satisfied in spirit, not literally (ACs 4 and 6a–d).** Each names a cell reading `—` in a
situation where the Context strip does not render at all: no snapshot means no Greeks, and
one unparseable Greek nulls the whole all-or-nothing block. Keeping US-34's shipped gate was
the explicit choice, so these are asserted as _nothing broken is shown_ — the strip is absent
**and** `NaN` appears nowhere, with the cockpit confirmed to have rendered so "absent" cannot
be satisfied by a blank page. The two ACs that are literally satisfiable (2 and 5 — Greeks
present, IV missing or malformed) assert a real dashed IV cell.

**AC 5 is split across layers.** The renderer cannot observe a pino warn, so its display half
is asserted in e2e and its logging half in the main-process adapter test.

## Existing tests this story rewrites

Listed so a reviewer does not read them as regressions. The list is deliberately short —
preserving US-34's behaviour is what keeps it short:

| Test                                                                          | Today                        | After                                         |
| ----------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- |
| `ContextStrip.spec.tsx:155` `renders — for IV when impliedVolatility is null` | asserts the `null` path only | asserts the `NaN` path its own comment names  |
| `ContextStrip.spec.tsx:67` IV percentage case                                 | reads `greeks.iv = 0.32`     | reads `impliedVolatility`                     |
| `e2e/position-cockpit.spec.ts:575` `US-34 AC: IV displayed as XX.X%`          | reads `greeks.iv`            | reads `impliedVolatility`                     |
| `e2e/position-cockpit.spec.ts:57` `SNAP_HOLD` fixture                         | `greeks: { …, iv: '0.25' }`  | `greeks: { … }` + sibling `impliedVolatility` |

Plus the type-driven fixture churn in areas 3 and 5, which `pnpm typecheck` names for you.

**Explicitly preserved:** `ContextStrip.spec.tsx:39` (`renders null when greeks are absent`),
`e2e/position-cockpit.spec.ts:592` (`US-34 AC: Greeks unavailable — ContextStrip absent`) and
`e2e/position-cockpit.spec.ts:612` (`HOLDING_SHARES`). All three must stay green untouched —
they are the guard that this defect fix did not change the strip's gating.

## Post-Change Checklist

1. `pnpm test`
2. `pnpm lint`
3. `pnpm typecheck` — must be clean with `greeks.iv` gone from all three declarations
4. `pnpm format`
5. `pnpm rebuild:electron && pnpm test:e2e e2e/position-cockpit.spec.ts`
6. `grep -rn "greeks\.iv" src/ e2e/` returns nothing
7. `/update-spec us-117` — the shape lands in `docs/spec/domain/market-data.md` (already
   documents the main-process type; the IPC-mirror and Context-strip display rules are new)
