# US-117 — A position's implied volatility is a real number or an honest dash, never NaN — Tasks

**Plan:** `plans/us-117/plan.md` · **Linear:** [OPT-10](https://linear.app/optionswheel/issue/OPT-10/us-117-a-positions-implied-volatility-is-a-real-number-or-an-honest) · **Kind:** bugfix · 3 points

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off
- **Refactor tasks must be run in the main conversation** — a subagent cannot invoke the
  `/refactor` skill. Collect an area's Refactor task and run it yourself.

### Before you start

Read `plans/us-117/research.md` §"Verified current state" first. The story's own diagnosis is
partly stale: the main-process half already landed on `wb-ivr-fixes`, and `implied volatility
already crosses the IPC at runtime`. Do not redo it.

Two decisions constrain every area below:

- **Greeks are all-or-nothing** — one non-finite Greek nulls the whole block (ADR 4)
- **The Context strip's render gate does not change** — US-34's shipped behaviour is
  preserved; only the IV cell learns to dash (ADR 5)

ABI reminder: `pnpm rebuild:node` before `pnpm test`, `pnpm rebuild:electron` before
`pnpm test:e2e`. pnpm 10 skips the `pre*` hooks, so neither happens for you.

---

## Layer 1 — Foundation (no dependencies)

> All three areas can be started immediately and run in parallel.

### Area 1 — Producer hardening (Alpaca mapper)

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts`
  - `mapOptionQuote omits impliedVolatility when Alpaca sends NaN` — asserts the property is
    absent, not the string `'NaN'`
  - `mapOptionQuote omits impliedVolatility when Alpaca sends Infinity`
  - `mapOptionQuote omits the whole greeks block when any greek is NaN` — loop over
    `delta`/`gamma`/`theta`/`vega` so each field is covered
  - `mapOptionQuote keeps a legitimate zero` — `impliedVolatility: 0` and `delta: 0` survive
    as `'0.0000'` (guards against a truthiness check)
  - `nonFiniteFigures returns [] for a clean snapshot` and for one that omits both blocks
  - `nonFiniteFigures names impliedVolatility when it is NaN` → `['impliedVolatility']`
  - `nonFiniteFigures names each non-finite greek` → `['greeks.delta', 'greeks.vega']`
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/alpaca-market-data-mappers.ts` _(depends on: Area 1 Red ✓)_
  - `isCompleteGreeks` (`:104`): four `typeof g.X === 'number'` → `Number.isFinite(g.X)`
  - `mapOptionQuote` (`:145`): `typeof snap.impliedVolatility === 'number'` →
    `Number.isFinite(...)`
  - New export `nonFiniteFigures(snap: AlpacaOptionSnapshot): string[]` — dotted field names
    that are present as numbers but not finite; see `data-model.md` §3
  - Keep the file pure — **no logger import** (its header at `:1-4` promises no I/O)
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data-mappers.ts` _(depends on: Area 1 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Declare the `['delta','gamma','theta','vega']` tuple once rather than twice
  - Check the comment at `:133-134` still describes the rule now that "partial" also means
    "non-finite"
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 3 — IPC type mirrors tell the truth

- [x] **[Red]** Write failing tests — `src/renderer/src/hooks/useOptionSnapshots.test.ts`
  - Type-level: an `OptionSnapshot` literal with **no** `greeks` and **no**
    `impliedVolatility` type-checks (fails `pnpm typecheck` today — `greeks` is required)
  - Type-level: a literal carrying `impliedVolatility: '0.2840'` type-checks (fails today —
    the field does not exist)
  - `useOptionSnapshots returns a snapshot that carries impliedVolatility` — proves the value
    survives the `api/market-data.ts` boundary rather than being erased by the cast in
    `getOptionSnapshots`
  - Run `pnpm typecheck` — must fail; run `pnpm test src/renderer/src/hooks/useOptionSnapshots.test.ts`
- [x] **[Green]** Implement — `src/preload/index.d.ts`, `src/renderer/src/api/market-data.ts` _(depends on: Area 3 Red ✓)_
  - `IpcOptionSnapshot` (`src/preload/index.d.ts:243`): `greeks` → optional, delete `iv`, add
    `impliedVolatility?: string`
  - `OptionGreeks` / `OptionSnapshot` (`src/renderer/src/api/market-data.ts:21`): same three
    edits. Exact before/after in `data-model.md` §1
  - Move `iv:` out of `greeks` into a sibling `impliedVolatility` in these fixtures:
    `useOptionSnapshots.test.ts:41`, `usePromotedQuote.test.ts:55`, `PositionCard.test.tsx:53`,
    `PositionCockpit.spec.tsx:74` — do not simply delete it
  - Run `pnpm typecheck` and `pnpm test` — all pass
- [x] **[Refactor]** `/refactor` — the two mirror files _(depends on: Area 3 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - These files are hand-maintained copies of `src/main/integrations/market-data-provider.ts`
    with no structural link — the direct cause of this defect. Adding a link is out of scope;
    leave a comment on each pointing at the source-of-truth type and note the duplication for
    a follow-up
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 4 — `parseFinite` helper

- [x] **[Red]** Write failing tests — `src/renderer/src/lib/format.test.ts`
  - `parseFinite returns the number for a well-formed decimal string` — `'0.2840'` → `0.284`,
    `'-0.05'` → `-0.05`
  - `parseFinite returns 0 for '0'` — a legitimate delta is **not** nulled (the case
    `parseFloat(x) || null` at `PositionCockpit.tsx:232` gets wrong)
  - `parseFinite returns null for undefined, null and the empty string`
  - `parseFinite returns null for the string 'NaN'`
  - `parseFinite returns null for 'abc' and 'Infinity'`
  - `parseFinite never returns NaN` — assert `Number.isNaN(result) === false` across the whole
    table; this is the property the component depends on
  - Run `pnpm test src/renderer/src/lib/format.test.ts` — all new tests must fail
- [x] **[Green]** Implement — `src/renderer/src/lib/format.ts` _(depends on: Area 4 Red ✓)_
  - `export function parseFinite(value: string | null | undefined): number | null` — `null`
    for nullish/empty and for any `parseFloat` result failing `Number.isFinite`. Full
    input/output table in `data-model.md` §4
  - Run `pnpm test src/renderer/src/lib/format.test.ts` — all pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/lib/format.ts` _(depends on: Area 4 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - `fmtMoney`, `pnlColor`, `pnlClass` all call bare `parseFloat` on strings from the same IPC
    boundary. **Mention, do not change** — converting them alters behaviour
    (`fmtMoney(undefined)` yields `"$NaN"` today) and belongs to its own story
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — Adapter + renderer mapping (depends on Layer 1)

> Both areas can run in parallel with each other once their Layer 1 dependencies are checked off.

### Area 2 — Adapter warn log

**Requires:** Area 1 Green ✓ (needs `nonFiniteFigures`)

- [x] **[Red]** Write failing tests — `src/main/integrations/alpaca-market-data.test.ts` _(depends on: Area 1 Green ✓)_
  - `getOptionSnapshot logs a warn naming the dropped field` — stub fetch to return
    `impliedVolatility: NaN`, spy the pino logger, assert one `warn` with
    `{ contract, fields: ['impliedVolatility'] }` and event
    `'option_snapshot_non_finite_figure'`
  - `getOptionSnapshot does not warn for a snapshot that merely omits impliedVolatility` —
    assert **zero** warn calls; absence is the normal case (`contracts: 161, withGreeks: 87`).
    This is what keeps the log from becoming noise
  - `getOptionSnapshot still returns the mapped snapshot when it warns` — `bid`/`ask`/`mid`
    intact, `impliedVolatility` absent; a bad IV must not fail the read
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — new tests must fail
- [x] **[Green]** Implement — `src/main/integrations/alpaca-market-data.ts:162` _(depends on: Area 2 Red ✓)_
  - Call `nonFiniteFigures(snap)` before `mapOptionQuote(snap)`; when non-empty emit
    `logger.warn({ contract: contractId, fields }, 'option_snapshot_non_finite_figure')`,
    following the shape of the existing warn at `:256`
  - **Do not** add it to `getOptionChainSnapshot` — 161 contracts per underlying is noise
    (`research.md` ADR 3)
  - Run `pnpm test src/main/integrations/alpaca-market-data.test.ts` — all pass
- [x] **[Refactor]** `/refactor` — `src/main/integrations/alpaca-market-data.ts` _(depends on: Area 2 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Settle the event name against its neighbours (`alpaca_chain_key_unparseable`,
    `alpaca_open_interest_unavailable`) — consider the `alpaca_` prefix, and make the test,
    the code and `contracts/market-data-option-snapshot.md` agree on one spelling
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### Area 5 — `buildCockpitInput` carries IV and cannot emit NaN

**Requires:** Area 3 Green ✓ (snapshot type must expose `impliedVolatility`) · Area 4 Green ✓ (`parseFinite`)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx` _(depends on: Area 3 Green ✓, Area 4 Green ✓)_
  - `passes impliedVolatility from the snapshot into the cockpit input` — snapshot with
    `impliedVolatility: '0.2840'` → strip shows `28.4%`. Fails today: the field is never read
  - `sets impliedVolatility to null when the snapshot omits it` — IV cell shows `—`
  - `sets impliedVolatility to null when the snapshot carries 'NaN'` — the regression case;
    cell shows `—` and `NaN` appears nowhere in the output
  - `sets impliedVolatility to null when there is no snapshot at all` — assert no `NaN` is
    rendered. The strip is **absent** here (no Greeks → US-34's gate), so assert on the
    absence of `NaN`, not on a dashed cell
  - `nulls the whole greeks block when one greek parses to NaN` — `greeks.vega: 'NaN'`; strip
    does not render and no `NaN` reaches the output (all-or-nothing, ADR 4)
  - `keeps a zero-valued figure` — `greeks.delta: '0'`; the strip **does** render
  - Run `pnpm test src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx`
- [x] **[Green]** Implement — `src/renderer/src/lib/verdict.ts`, `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` _(depends on: Area 5 Red ✓)_
  - `CockpitInput` (`verdict.ts:19`): delete `iv?: number` from `greeks`; change
    `impliedVolatility?: number | null` to required `impliedVolatility: number | null` —
    required-and-nullable is deliberate, it makes `buildCockpitInput` fail to compile until it
    decides (ADR 2)
  - `buildCockpitInput` (`PositionCockpit.tsx:229`): route all six figures through
    `parseFinite` — four Greeks, `currentMid`, and `underlying` (replacing the hand-rolled
    `parseFloat(underlyingPrice) || null` at `:232`)
  - Add `impliedVolatility: parseFinite(snapshot?.impliedVolatility)` as a sibling of
    `greeks`; delete `iv: parseFloat(snapshot.greeks.iv)` at `:239`
  - Keep `greeks` all-or-nothing: if any of the four `parseFinite` results is `null`, set
    `greeks` to `null` rather than emitting a partial object
  - Fix the inline `CockpitInput` literals `pnpm typecheck` names: `verdict.spec.ts`,
    `RiskSnapshot.spec.tsx:20`, `VerdictBlock.spec.tsx:27`
  - Run `pnpm test && pnpm typecheck` — all pass
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` _(depends on: Area 5 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - The parse-then-null-if-any-null shape wants a small local function named for the rule it
    encodes (all-or-nothing), not for its mechanics
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 3 — Context strip (depends on Layer 2)

### Area 6 — IV cell dashes instead of rendering NaN

**Requires:** Area 5 Green ✓ (`CockpitInput.impliedVolatility` must be required-and-nullable)

- [x] **[Red]** Write failing tests — `src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx` _(depends on: Area 5 Green ✓)_
  - **Rewrite `renders — for IV when impliedVolatility is null` at `:155`** to assert the
    `NaN` path its own comment at `:157` names: pass `impliedVolatility: NaN` as well as
    `null`, assert `—` in both and no `NaN` in the output. Drop the
    `as unknown as CockpitInput` cast — the fixture is legal once `greeks.iv` is gone
  - `renders IV as a one-decimal percentage` — `impliedVolatility: 0.284` → `28.4%` (the
    existing `:67` case moves off `greeks.iv = 0.32`)
  - `renders the IV cell as — while the Greek cells still show values` — proves IV dashes
    **independently** rather than taking the strip down with it
  - `IV sub-label still reads "implied vol" when the cell is dashed` — and `rank {n}` when
    `ivRank` is passed
  - `dashed IV cell takes the default text colour` — `text-wb-text-primary`, not a severity
    token
  - **Leave green and untouched:** `renders null when greeks are absent` at `:39` — that is
    US-34's behaviour and this story preserves it
  - Run `pnpm test src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx`
- [x] **[Green]** Implement — `src/renderer/src/components/position-cockpit/ContextStrip.tsx` _(depends on: Area 6 Red ✓)_
  - **Keep both early returns** at `:27` and `:31` exactly as they are
  - Replace the fallback at `:37-38` with a direct read of `input.impliedVolatility` — the
    `!== undefined` dance and the `greeks.iv` fallback both go
  - Keep the formatter `iv != null ? \`${(iv \* 100).toFixed(1)}%\` : '—'`— it is now correct,
because`parseFinite`guarantees a finite number or`null`and`NaN`can no longer reach
it. Rules in`data-model.md` §5
  - Nothing else changes. Tailwind `wb-*` tokens only, no inline styles
  - Run `pnpm test src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx`
- [x] **[Refactor]** `/refactor` — `src/renderer/src/components/position-cockpit/ContextStrip.tsx` _(depends on: Area 6 Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - With the fallback gone the `iv` local may be needless indirection — inline it if it reads
    better, keep it if the name earns its place
  - Confirm `grep -rn "greeks\.iv" src/` is empty; this file was the last production reader
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 4 — E2E Tests

**Requires:** All Green tasks from Layers 1–3 ✓

### Area 7 — E2E

- [x] **[Red]** Write failing e2e tests — `e2e/position-cockpit.spec.ts` _(depends on: all Green tasks ✓)_
  - **First fix the fixture:** `SNAP_HOLD` at `:57` still spells `greeks: { …, iv: '0.25' }`;
    move it to a sibling `impliedVolatility: '0.2500'` or every IV assertion reads a dash
  - Assert against the **IV cell specifically**, not a page-wide `:has-text` — a coincidental
    `28.4%` elsewhere must not satisfy these
  - AC coverage (one `it()` per AC, names mirroring AC language):
    - AC-1: The contract's implied volatility is shown as a percentage →
      `it('US-117 AC: the contract's implied volatility is shown as a percentage')`
    - AC-2: A contract with no IV reads `—`, not `NaN%` →
      `it('US-117 AC: a contract the provider has no implied volatility for reads as absent')`
      — also assert Theta still shows a real figure, so the dash is IV's alone
    - AC-3: A newly added position shows its IV without waiting →
      `it('US-117 AC: a newly added position shows its implied volatility without waiting')` —
      create the position **through the UI in this test**, assert on first render without
      advancing the 60 s poll
    - AC-4: No snapshot at all reads as absent, not broken →
      `it('US-117 AC: no snapshot at all reads as absent, not broken')` — strip absent
      (`:text-is("IV")` count 0) **and** no `NaN` anywhere **and** the cockpit did render
      (`Awaiting market data` visible), so "absent" cannot be satisfied by a blank page
    - AC-5: A malformed figure is treated as absent →
      `it('US-117 AC: a malformed figure is treated as absent')` — `impliedVolatility: 'NaN'`
      with full `greeks`; the warn half is asserted in Area 2, note that in a comment
    - AC-6a: Outline, `delta` → `it('US-117 AC: delta that cannot be parsed renders no NaN')`
    - AC-6b: Outline, `theta` → `it('US-117 AC: theta that cannot be parsed renders no NaN')`
    - AC-6c: Outline, `gamma` → `it('US-117 AC: gamma that cannot be parsed renders no NaN')`
    - AC-6d: Outline, `vega` → `it('US-117 AC: vega that cannot be parsed renders no NaN')`
  - Also update `US-34 AC: IV displayed as XX.X% not decimal` at `:575` to read
    `impliedVolatility` instead of `greeks.iv`
  - **Leave green and untouched:** `:592` (`Greeks unavailable — ContextStrip absent`) and
    `:612` (`HOLDING_SHARES`) — they are the guard that this fix did not change the gating
  - `pnpm rebuild:electron && pnpm test:e2e e2e/position-cockpit.spec.ts` — new tests must fail
- [x] **[Green]** Make e2e tests pass _(depends on: E2E Red ✓)_
  - No production code expected. Any case that does not pass on Areas 1–6 is a real gap in
    those areas, **not** a test to weaken
  - Run `pnpm test:e2e e2e/position-cockpit.spec.ts` — all pass
- [x] **[Refactor]** `/refactor` e2e tests _(depends on: E2E Green ✓)_
  - **Invoke the `/refactor` skill** — do not skip or treat as a visual review
  - Drive the four Scenario-Outline cases from a `['delta','theta','gamma','vega']` table, but
    keep one `it` per field so a failure names the field
  - Extract the "no `NaN` anywhere on the page" assertion (it recurs in four cases) and a
    `contextCell(page, label)` locator helper
  - Run `pnpm test:e2e e2e/position-cockpit.spec.ts`

---

## Completion Checklist

- [x] All Red tasks complete (tests written and failing for the right reason)
- [x] All Green tasks complete (all tests passing)
- [x] All Refactor tasks complete (lint + typecheck clean)
- [x] E2E tests cover every AC — see the AC Audit table in `plan.md`, including the two
      qualifications (ACs 4 and 6a–d satisfied in spirit; AC 5 split across layers)
- [x] `grep -rn "greeks\.iv" src/ e2e/` returns nothing
- [x] `pnpm test && pnpm lint && pnpm typecheck && pnpm format` — all clean
- [x] `pnpm rebuild:electron && pnpm test:e2e` — full suite green
- [x] `/update-spec us-117` — captures the IPC-mirror shape and the IV display rule into
      `docs/spec/domain/market-data.md`
