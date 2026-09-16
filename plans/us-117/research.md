# Research: US-117 — A position's implied volatility is a real number or an honest dash, never NaN

**Linear:** [OPT-10](https://linear.app/optionswheel/issue/OPT-10/us-117-a-positions-implied-volatility-is-a-real-number-or-an-honest) ·
**Epic:** 06 — Live Market Data and IVR Foundation · **Kind:** bugfix · **Estimate:** 3 points

---

## Verified current state (the story's diagnosis is partly stale)

The story was written against an earlier tree. Half the refactor it proposes has already
landed on `wb-ivr-fixes`. What follows is what is true in the working tree today, each
point read from source.

### Already correct — the main process

| Fact                                                                                               | Evidence                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| The domain `OptionSnapshot` has optional `greeks` and a **top-level** `impliedVolatility?: string` | `src/main/integrations/market-data-provider.ts:35-49`                                                                  |
| `mapOptionQuote` populates `quote.impliedVolatility` from Alpaca's `snap.impliedVolatility`        | `src/main/integrations/alpaca-market-data-mappers.ts:145-147`                                                          |
| Greeks are already all-or-nothing: a partial set is dropped wholesale                              | `isCompleteGreeks`, `alpaca-market-data-mappers.ts:104-113`                                                            |
| The IPC handler passes the provider's snapshot through untouched — no field is stripped            | `src/main/ipc/market-data.ts:64-69` → `fetchOptionSnapshots`, `src/main/services/market-data.ts:57-88`                 |
| The spec already documents the target shape                                                        | `docs/spec/domain/market-data.md:251-269` — "`impliedVolatility?: string // 4dp — top-level, NOT nested under greeks`" |

**Consequence:** implied volatility already crosses the IPC boundary at runtime. It is not
lost in transit. The story's claim that `alpaca-market-data-mappers.ts` "maps delta, gamma,
theta and vega and stops" is no longer true.

### Still broken — the two hand-written type mirrors and the renderer

1. **`src/preload/index.d.ts:243-256`** — `IpcOptionSnapshot` still declares
   `greeks` as **required** with a **required `iv: string`**, and has no
   `impliedVolatility`. This file is a hand-maintained mirror of the main-process type with
   no structural link to it, which is why it drifted.

2. **`src/renderer/src/api/market-data.ts:21-37`** — `OptionGreeks` / `OptionSnapshot`
   repeat the same lie a second time.

3. **`src/renderer/src/components/position-cockpit/PositionCockpit.tsx:232-240`** —
   `buildCockpitInput` never sets `impliedVolatility`, and reads
   `iv: parseFloat(snapshot.greeks.iv)` → `parseFloat(undefined)` → `NaN`. The four Greeks
   beside it are bare `parseFloat` with no finite check.

4. **`src/renderer/src/components/position-cockpit/ContextStrip.tsx:37-39`** — already
   prefers `input.impliedVolatility`, but falls back to `input.greeks.iv`, and the guard is
   `iv != null`, which `NaN` passes.

So the renderer cannot _see_ the value — the type says the field does not exist — and the
field it is told to read is one nobody writes.

### A second producer hole the story did not find

`mapOptionQuote` guards implied volatility with `typeof snap.impliedVolatility === 'number'`
(`alpaca-market-data-mappers.ts:145`), and `typeof NaN === 'number'` is `true`. So
`new Decimal(NaN).toFixed(4)` emits the **string `"NaN"`** across the IPC. `isCompleteGreeks`
(`:104-113`) has the identical hole on all four Greeks. Today no screen shows it because the
renderer never reads `impliedVolatility` — the moment it does, a single malformed Alpaca
quote puts `NaN%` back on the strip through a different door.

This is the AC "A malformed figure is treated as absent", and it lives in the producer.

---

## Architecture Decisions

### ADR: Implied volatility is a sibling of `greeks`, never a member of it

- **Decision:** `impliedVolatility?: string` sits beside `greeks` on the IPC snapshot, and
  `greeks.iv` is deleted from `src/preload/index.d.ts`, `src/renderer/src/api/market-data.ts`
  and `CockpitInput.greeks` in `src/renderer/src/lib/verdict.ts`. The preload and renderer
  types become exact mirrors of `OptionSnapshot` in
  `src/main/integrations/market-data-provider.ts`: `greeks` optional, `impliedVolatility`
  optional, both `4dp` decimal strings.
- **Why:** it is already the main-process shape, already the shape documented at
  `docs/spec/domain/market-data.md:257`, and it is the truthful one — implied volatility is a
  property of the quote, not of the Greeks. Alpaca supplies it independently of the Greeks
  block, so nesting it forces a contract with IV but no Greeks to discard its IV. Making the
  two mirrors match the producer removes the drift that caused the defect rather than
  papering over it.
- **Alternatives considered:** populate `greeks.iv` in the mapper. Rejected — it would make
  the app's own type disagree with the vendor shape, keep IV hostage to a complete Greek set
  (roughly half of quoted contracts have none), and leave `greeks` and `iv` with different
  availability rules under one required key.

### ADR: Optionality expresses absence, not `| null`

- **Decision:** on the IPC-crossing types the fields are optional —
  `greeks?: {...}` and `impliedVolatility?: string` — not `string | null`. On the
  renderer-internal `CockpitInput` they are **required and nullable**:
  `greeks: {...} | null` (already so) and `impliedVolatility: number | null` (currently
  optional; this story makes it required).
- **Why:** the producer _omits_ the key rather than sending null — `mapOptionQuote`
  assigns conditionally — so `?` is what actually crosses the wire, and `strictNullChecks`
  forces every consumer to handle `undefined` exactly as it would `null`. Inside the renderer
  the opposite is right: making `impliedVolatility` required-and-nullable on `CockpitInput`
  means `buildCockpitInput` _cannot compile_ without deciding what the value is. That is the
  precise shape of the original bug — a required field no producer filled — inverted so the
  compiler catches it.
- **Alternatives considered:** `string | null` on the IPC types. Rejected — it would describe
  a null the producer never sends, and every consumer would have to handle both `null` and
  `undefined` anyway.

### ADR: Non-finite figures are dropped at the producer and logged at the adapter

- **Decision:** `mapOptionQuote` and `isCompleteGreeks` switch from `typeof x === 'number'`
  to `Number.isFinite(x)`, so a `NaN`/`Infinity` figure is **omitted** rather than
  stringified. The mapper stays pure and silent; it also exports a pure
  `nonFiniteFigures(snap): string[]` naming the fields that were present but unusable.
  `AlpacaMarketDataProvider.getOptionSnapshot` (`src/main/integrations/alpaca-market-data.ts:162`)
  logs `logger.warn({ contract, fields }, 'option_snapshot_non_finite_figure')` when that
  array is non-empty.
- **Why:** "fix the producer, not the formatter" — a guard at the render would hide `NaN%`
  while leaving the cell empty forever. Splitting drop-from-map and log-from-adapter keeps
  the mapper's own contract ("No I/O — every function here is total and side-effect free",
  `alpaca-market-data-mappers.ts:1-4`) intact while still satisfying the AC's warn, and it
  matches how the file already handles a bad chain key (pure `mapChainEntry` returns null,
  `alpaca-market-data.ts:190` logs it).
- **Alternatives considered:** (a) `console.warn` from the renderer — rejected, the renderer
  has no logging channel at all (zero `console.*` calls in `src/renderer`) and adding one for
  a single call site is a new convention for no gain; (b) logging in both layers — rejected,
  two log lines per defect. The chain path (`getOptionChainSnapshot`) deliberately stays
  silent: 161 contracts per underlying would make it noise, and a dropped chain Greek is
  already the documented normal case.

### ADR: Greeks stay all-or-nothing; implied volatility is independent

- **Decision:** if any one of delta/gamma/theta/vega is missing or non-finite, the whole
  `greeks` block is absent — the existing `isCompleteGreeks` rule, now hardened. Implied
  volatility is evaluated separately and can be present with no Greeks, or absent with a full
  set.
- **Why:** it is the rule the producer already enforces, and it keeps `CockpitInput.greeks`
  a single nullable object rather than four independently-nullable numbers. Four nullable
  Greeks would ripple through `computeVerdict`, `computeDistance` and `RiskSnapshot`
  (`verdict.ts:129-150`, `RiskSnapshot.tsx:32-36`), all of which read `input.greeks.delta`
  as a plain number — a large blast radius for a 3-point defect fix. The Scenario Outline
  ("No Greek renders as NaN") is satisfied either way: an unparseable delta dashes the Delta
  cell, and under this rule it dashes the neighbouring three as well, which is honest.
- **Alternatives considered:** per-Greek nullability. Rejected on blast radius; it also
  contradicts the mapper comment at `:133-134` ("A partial greek set is unusable for the
  screener's delta ranking, so it is dropped wholesale").

### ADR: The Context strip keeps its all-or-nothing gate; only the IV cell learns to dash

- **Decision:** `ContextStrip` keeps both early returns (`if (!input.greeks) return null` at
  `:27` and `if (!theta) return null` at `:31`). The strip renders only when the contract has
  a complete Greek set. Inside it, the **IV cell** dashes independently — implied volatility
  is a sibling of `greeks`, so a contract with Greeks and no IV shows a real dashed cell.
- **Why:** it preserves the shipped US-34 acceptance criterion asserted at
  `e2e/position-cockpit.spec.ts:592` and its unit sibling `ContextStrip.spec.tsx:39`, both of
  which say a Greek-less contract shows no strip at all. This story is a defect fix scoped to
  one broken figure; inverting a shipped AC from another story is a product change that
  belongs to that story.
- **Consequence — two ACs are satisfied in spirit, not literally.** "No snapshot at all reads
  as absent → the IV cell reads `—`" and the Scenario Outline's "the `<label>` cell reads `—`"
  both name a cell that does not exist when there are no Greeks. They are read as _nothing
  broken is shown_, and asserted as: the strip is absent **and** `NaN` appears nowhere on the
  page. Recorded here so the gap is deliberate and visible rather than quietly dropped. The
  two ACs that _are_ literally satisfiable — a contract with Greeks but no IV, and one with
  Greeks and a malformed IV — assert a real dashed IV cell.
- **Alternatives considered:** (a) always render, dashing every empty cell. That is the
  literal reading of the AC and would also surface IV on the roughly half of contracts Alpaca
  gives no Greeks for (`contracts: 161, withGreeks: 87`, per the story). Rejected here to keep
  US-34's AC intact — it is worth its own story. (b) per-Greek nullability so one bad Greek
  dashes one cell — rejected on blast radius, see the all-or-nothing ADR above.

### ADR: One shared finite-parse helper at the renderer edge

- **Decision:** add `parseFinite(value: string | undefined | null): number | null` to
  `src/renderer/src/lib/format.ts`, returning `null` for absent input and for any parse that
  is not `Number.isFinite`. `buildCockpitInput` routes all six figures through it — the five
  in `PositionCockpit.tsx:233-240` plus `underlying`, which today hand-rolls the same guard
  as `parseFloat(underlyingPrice) || null` at `:232`.
- **Why:** line 232 already proves the codebase wants this behaviour; it was written once by
  hand and not applied to its five neighbours, which is the whole "same hazard sits on the
  other three Greeks" observation in the story. One named helper closes all six and leaves
  nothing for the next figure to forget. It is a second line of defence only — the producer
  guard above is what makes the number _appear_. `|| null` is deliberately not reused: it
  also swallows a legitimate `0`, which is a valid delta.
- **Alternatives considered:** a `Number.isFinite` check inside `ContextStrip`'s formatter.
  Rejected — it would dash the cell forever while the mapping stayed broken, exactly the
  formatter-patch the story warns against.

---

## Open Questions

Both questions raised in planning were resolved by the user before Phase 1; recorded here as
the ADRs above.

1. _AC "No snapshot at all … the IV cell reads —" versus `ContextStrip` returning null and the
   US-34 e2e asserting its absence._ → **Resolved:** the shipped US-34 AC wins — today's gate
   stays, and only the IV cell dashes. See ADR "The Context strip keeps its all-or-nothing
   gate".
2. _Where the warn for a malformed figure lives, given the renderer has no logger._ →
   **Resolved:** main process, dropped in the pure mapper and logged at the Alpaca adapter.
   See ADR "Non-finite figures are dropped at the producer".

No unresolved `NEEDS CLARIFICATION` items.

---

## Out of scope (from the story, restated for the implementer)

- Making the Context strip render for a contract with no Greeks (and so surfacing IV on the
  ~half of contracts Alpaca gives no Greeks for). Deliberately deferred to keep US-34's AC —
  see the ADR above; it is a product change worth its own story.
- Passing `ivRank` into the strip. The prop exists and nothing passes one
  (`PositionDetailContent.tsx:50` omits it); the sub-label stays `implied vol`. IV rank is a
  Barchart per-underlying percentile, a different value from a different provider.
- Any collector run, Barchart call, or US-98 staleness tier — this number is already in the
  main process on every 60 s snapshot poll (`useOptionSnapshots.ts:21`).
- The Theta/Vega/Gamma formulas. Only the absent/unparseable path changes.
- `getOptionChainSnapshot` warn logging (see ADR rationale).
