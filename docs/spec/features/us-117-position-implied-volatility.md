# US-117: A position's implied volatility is a real number or an honest dash, never NaN

<!-- generated:from us-117 -->

> **Status: shipped.** The Context strip's IV cell reads `28.4%` when the provider supplies the
> figure and `—` when it does not. `NaN%` is unreachable from any of the five figures on the
> strip. `greeks.iv` no longer exists in any of the three type declarations.
>
> No schema change, no migration, no new dependency, no new credential.

## The problem

The position cockpit's Context strip rendered:

```
IV
NaN%
implied vol
```

That is not a missing-data state. It is a field the app promised, never filled, and then
formatted anyway.

Four causes, each necessary:

1. **The IPC contract declared a field nobody writes.** `IpcOptionSnapshot` and the renderer's
   `OptionGreeks` both carried a **required** `iv: string`. No producer in `src/main` has ever
   populated it.
2. **The real figure was invisible to the renderer.** `impliedVolatility` was already correct in
   the main process and already crossing the IPC at runtime — but no renderer-side type declared
   it, so the renderer could not see it.
3. **The renderer parsed the absent field.** `parseFloat(snapshot.greeks.iv)` is
   `parseFloat(undefined)` is `NaN`.
4. **The display guard did not catch it.** `iv != null` is `true` for `NaN`, so `NaN` sailed into
   `(NaN * 100).toFixed(1)` → `"NaN"`.

Two things made this worth fixing at the producer rather than patching at the render:

- **It was a silent type lie.** `typecheck` passed throughout, because the type claimed
  `iv: string` existed. Nothing in the type system can catch a producer that never writes a
  required field, so the defect stayed invisible until it reached a screen.
- **The same hazard sat on the other three Greeks.** `delta`, `theta`, `gamma` and `vega` were
  all bare `parseFloat` with no finite check. They were not visibly broken only because they
  happened to be populated.

This is **IV, not IVR.** The bench's IV _rank_ is a 0–100 percentile per underlying scraped from
Barchart. The cockpit's IV is per-contract implied volatility from the Alpaca option snapshot,
already fetched live for the position's own contract. Fixing this needed no collector run and no
Barchart call.

## What was built

### Implied volatility is a sibling of `greeks`, never a member

`greeks.iv` is deleted from all three declarations, and `impliedVolatility?: string` sits beside
`greeks`. The preload and renderer types become exact mirrors of the main-process
`OptionSnapshot`, which was already the truthful shape — implied volatility is a property of the
quote, not of the Greeks, and Alpaca supplies the two independently — so nesting it would force
a contract with IV but no Greeks to discard its IV.

### Non-finite figures are dropped at the producer, logged at the adapter

`typeof NaN === 'number'` is `true`, so the mapper's old `typeof x === 'number'` predicates
admitted `NaN` and `new Decimal(NaN).toFixed(4)` put the **string `"NaN"`** on the IPC. Both
predicates are now `Number.isFinite`, so an unusable figure is **omitted**.

The mapper stays pure — its header promises "No I/O — every function here is total and
side-effect free" — and exports `nonFiniteFigures(snap): string[]` naming the fields that were
present but unusable. `AlpacaMarketDataProvider.getOptionSnapshot` does the logging:

| Level  | Event                                      | Fields               |
| ------ | ------------------------------------------ | -------------------- |
| `warn` | `alpaca_option_snapshot_non_finite_figure` | `contract`, `fields` |

An **omitted** figure is the normal case (`contracts: 161, withGreeks: 87` for one underlying)
and never warns — that is what keeps the log from becoming noise. `getOptionChainSnapshot`
deliberately stays silent: 161 contracts per underlying would drown it.

### One finite-parse helper at the renderer edge

`parseFinite(value): number | null` returns `null` for absent, empty or unparseable input and
never returns `NaN`. `buildCockpitInput` routes all six figures through it — the four Greeks,
`currentMid` and `underlying`. It deliberately does not reuse `parseFloat(x) || null`, which also
swallows a legitimate `0`, and zero is a valid delta.

### The type now forces the decision

`CockpitInput.impliedVolatility` is **required and nullable** (`number | null`), not optional.
That makes `buildCockpitInput` fail to compile until it decides what the value is — the original
bug (a required field no producer filled), inverted so the compiler catches it.

### Greeks stay all-or-nothing

One non-finite Greek nulls the whole block, at the producer (`isCompleteGreeks`) and again at the
renderer (`parseAllOrNothing`). `computeVerdict`, `computeDistance` and `RiskSnapshot` all read
`input.greeks.delta` as a plain number, so four independently-nullable Greeks would have been a
large blast radius for a 3-point defect fix.

### The Context strip's render gate did not change

Both early returns stay: a contract with no complete Greek set shows **no strip at all**,
preserving the behaviour [US-34](us-34-position-cockpit.md) shipped. Only the IV cell learned to
dash. Because implied volatility is a sibling of `greeks`, a contract with Greeks and no IV shows
a real dashed cell beside live Theta, Vega and Gamma. A dashed cell takes the default
`text-wb-text-primary`, not a severity token.

## Acceptance criteria

Nine rows, each with one verbatim-named e2e case in `e2e/position-cockpit.spec.ts`:

| #      | Criterion                                                            | Result  |
| ------ | -------------------------------------------------------------------- | ------- |
| 1      | IV of `0.284` → the cell reads `28.4%`                               | covered |
| 2      | No IV → the cell reads `—`, not `NaN%`                               | covered |
| 3      | A newly added position shows its IV without waiting                  | covered |
| 4 †    | No snapshot at all reads as absent                                   | covered |
| 5      | A malformed figure reads `—` **and is logged at warn level**         | split ‡ |
| 6a–d † | Outline: unparseable `delta`/`theta`/`gamma`/`vega` renders no `NaN` | covered |

**† Satisfied in spirit, not literally.** These name a cell reading `—` in a situation where the
strip does not render at all: no snapshot means no Greeks, and one unparseable Greek nulls the
whole all-or-nothing block. Keeping US-34's gate was the explicit decision, so these are asserted
as _nothing broken is shown_ — the strip is absent **and** `NaN` appears nowhere on the page
**and** the cockpit itself rendered, so "absent" cannot be satisfied by a blank page or a crash.
Each Scenario-Outline case first waits for the P&L panel (driven by the same snapshot but not by
its Greeks), so "no strip" cannot pass vacuously before data loads.

Recorded for honesty: under the retained gate, _every_ IV scenario is conditional on a complete
Greek set, not only rows 4 and 6.

**‡ AC 5 is split across layers.** The renderer cannot observe a pino warn, so the display half is
asserted in e2e and the logging half in the main-process adapter test. Note also that the e2e
fake provider JSON-parses its fixture straight into `OptionSnapshot` **without** going through
`mapOptionQuote`, so e2e proves the renderer half only — the producer hardening rests on the unit
tests in `alpaca-market-data.test.ts`.

## Contracts touched

- `OptionSnapshot` mirrors in `src/preload/index.d.ts` and `src/renderer/src/api/market-data.ts`
  — `greeks` becomes optional, `greeks.iv` is deleted, `impliedVolatility?: string` is added. See
  [market-data](../domain/market-data.md) for the full shape and availability rules.
- New pure export `nonFiniteFigures` in `alpaca-market-data-mappers.ts`.
- New export `parseFinite` in `src/renderer/src/lib/format.ts`.
- `CockpitInput` in `src/renderer/src/lib/verdict.ts` — `greeks` loses `iv`; `impliedVolatility`
  becomes required-and-nullable.
- No IPC channel, Zod schema, database table or migration changed.

## Decisions & tradeoffs

- **The two IPC type mirrors are still hand-maintained copies with no structural link** — the
  direct cause of this defect. Each now carries a comment naming the source of truth, but a
  comment is a convention, not a mechanism: `typecheck` still cannot see a mirror disagreeing
  with its source. Adding the link was explicitly out of scope for a 3-point bugfix.
- **`ContextStrip`'s guard is `iv != null && Number.isFinite(iv)`.** The `!= null` looks
  redundant — `Number.isFinite(null)` is already `false` — but it is load-bearing:
  `Number.isFinite` is not a TypeScript type predicate, so without it `iv * 100` does not
  compile.
- **`fmtMoney`, `pnlColor` and `pnlClass` still call bare `parseFloat`** on strings from the same
  IPC boundary. Converting them changes behaviour (`fmtMoney(undefined)` yields `"$NaN"` today)
  and belongs to its own story.
- **The HOLDING_SHARES card in `PositionCockpit.tsx` still uses bare `parseFloat`** for the basis
  and spot price, so an unparseable value renders `+$NaN` — the same defect class, one panel up.
  Deferred for the same reason.
- **Showing an IV _rank_ in the strip is still not wired.** The `ivRank` prop exists and nothing
  passes one, so the sub-label permanently reads "implied vol". That is an enhancement, not this
  defect.

## Source files

- `src/main/integrations/alpaca-market-data-mappers.ts` — `GREEK_NAMES`, `isFiniteNumber`,
  `isUnusable`, `isCompleteGreeks`, `nonFiniteFigures`, `mapOptionQuote`
- `src/main/integrations/alpaca-market-data.ts` — the `getOptionSnapshot` warn
- `src/preload/index.d.ts`, `src/renderer/src/api/market-data.ts` — the two type mirrors
- `src/renderer/src/lib/format.ts` — `parseFinite`
- `src/renderer/src/lib/verdict.ts` — `CockpitInput`
- `src/renderer/src/components/position-cockpit/PositionCockpit.tsx` — `parseAllOrNothing`,
  `buildCockpitInput`
- `src/renderer/src/components/position-cockpit/ContextStrip.tsx` — the IV cell
- `e2e/position-cockpit.spec.ts` — nine US-117 cases

<!-- /generated -->
