# US-105: A position's implied volatility is a real number or an honest dash, never NaN

**As a** trader looking at an open position's context strip to judge whether the premium is rich,
**I want** the IV figure to show the contract's actual implied volatility,
**So that** I am not staring at "NaN%" — a value that is not merely missing but visibly broken, and that tells me nothing about whether to hold, roll, or close.

---

## Context

The position cockpit's Context strip shows four figures: Theta, **IV**, Vega and Gamma. On a
manually entered wheel position the IV cell renders:

```
IV
NaN%
implied vol
```

This is not a missing-data state. It is a field the app promises, never fills, and then
formats anyway.

**The chain of causes, each verified:**

1. The IPC contract declares the field as required and non-nullable —
   `src/preload/index.d.ts:256`:

   ```ts
   greeks: {
     delta: string
     gamma: string
     theta: string
     vega: string
     iv: string // ← promised
   }
   ```

2. **No producer in `src/main` ever populates it.** `alpaca-market-data-mappers.ts` maps
   `delta`, `gamma`, `theta` and `vega` and stops. The real figure exists there, on a
   different field entirely — `quote.impliedVolatility` — and is dropped at the IPC boundary:
   `impliedVolatility` appears nowhere in `src/preload/index.d.ts`.

3. The renderer parses the absent field — `PositionCockpit.tsx:239`:

   ```ts
   iv: parseFloat(snapshot.greeks.iv) // parseFloat(undefined) === NaN
   ```

4. The display guard does not catch it — `ContextStrip.tsx:39`:

   ```ts
   const ivValue = iv != null ? `${(iv * 100).toFixed(1)}%` : '—'
   ```

   `NaN != null` is `true`, so `NaN` sails through into `(NaN * 100).toFixed(1)` → `"NaN"`.

Two details make this worth fixing carefully rather than patching at the render.

**It is a silent type lie.** `typecheck` passes, because the type claims `iv: string` exists.
Nothing in the type system can catch a producer that never writes a required field, so the
defect is invisible until it reaches a screen.

**Somebody already saw the symptom and guarded the wrong thing.** `ContextStrip.spec.tsx:157`
reads:

> "When impliedVolatility is null the IV cell must show `—` rather than `NaN%` or crashing."

The test covers `null`. The value that actually arrives is `NaN`. The same file's sibling
mapping, one line up at `PositionCockpit.tsx:232`, _does_ defend itself —
`parseFloat(underlyingPrice) || null` coerces `NaN` away — so the underlying price was
protected and the Greeks were not.

**The same hazard sits on the other three Greeks.** `delta`, `theta`, `gamma` and `vega` are
all `parseFloat` with no finite check. They are not visibly broken today only because they
happen to be populated; a single malformed quote would put `NaN` in the strip.

### This is IV, not IVR — they are different values

Worth stating because the two get conflated. The bench's **IV rank** is a 0–100 percentile
per underlying, scraped from Barchart and aged by US-98. The cockpit's **IV** is per-contract
implied volatility from the Alpaca option snapshot, already fetched live for the position's
own contract. Fixing this needs no collector run and no Barchart call — the number is already
in the main process on every snapshot poll.

The Context strip does accept an `ivRank` prop, and nothing ever passes one
(`PositionDetailContent.tsx:50`), so the sub-label permanently reads "implied vol". Showing a
rank there is an enhancement, not this defect.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader holds an open CSP on MSFT
  And the position detail page is open

Scenario: The contract's implied volatility is shown as a percentage
  Given the option snapshot for the MSFT contract reports an implied volatility of 0.284
  When the trader views the Context strip
  Then the IV cell reads "28.4%"

Scenario: A contract the provider has no implied volatility for reads as absent
  Given the option snapshot for the MSFT contract carries no implied volatility
  When the trader views the Context strip
  Then the IV cell reads "—"
  And it does not read "NaN%"

Scenario: A newly added position shows its implied volatility without waiting
  Given the trader has just entered a wheel position on MSFT manually
  And an option snapshot is available for its contract
  When the position detail page opens
  Then the IV cell shows the contract's implied volatility
  And it does not read "NaN%"

Scenario: No snapshot at all reads as absent, not broken
  Given no option snapshot is available for the MSFT contract
  When the trader views the Context strip
  Then the IV cell reads "—"

Scenario: A malformed figure is treated as absent
  Given the option snapshot reports an implied volatility that is not a number
  When the trader views the Context strip
  Then the IV cell reads "—"
  And the malformed value is logged at warn level

Scenario Outline: No Greek renders as NaN
  Given the option snapshot reports <field> as a value that cannot be parsed
  When the trader views the Context strip
  Then the <label> cell reads "—"

  Examples:
    | field | label |
    | delta | Delta |
    | theta | Theta |
    | gamma | Gamma |
    | vega  | Vega  |
```

---

## Technical Notes

- **Fix the producer, not the formatter.** A `Number.isFinite` guard at the render would hide
  `NaN%` while leaving the field permanently empty — the trader would get an honest dash
  forever and never the number. Carry `impliedVolatility` across the IPC, which is where the
  value is actually lost. The guard is still worth adding, as a second line of defence.
- **Decide where the field lives and make the type tell the truth.** Either populate
  `greeks.iv`, or promote `impliedVolatility` to a sibling of `greeks` on the snapshot and
  drop `greeks.iv` entirely. The second matches the main-process shape, which already treats
  implied volatility as a property of the quote rather than of the Greeks. Whichever is
  chosen, the field must be **nullable in the type** — `iv: string | null` — so a consumer is
  forced to handle absence. A required field no producer fills is the root cause here.
- **`withGreeks` is routinely less than the contract count.** The live logs show `contracts:
161, withGreeks: 87` for one underlying — roughly half of quoted contracts carry no Greeks at
  all. Absent implied volatility is the normal case, not an edge case, which is why the dash
  has to be correct rather than incidental.
- **Harden the whole mapping, not just IV.** `PositionCockpit.tsx:225-242` parses five figures
  with bare `parseFloat`. A small shared helper returning `number | null` for a non-finite
  parse would close all five and match what line 232 already does by hand for the underlying
  price.
- **Update the existing spec rather than adding beside it.** `ContextStrip.spec.tsx:157`
  asserts the `null` path and names `NaN%` in its comment; it should assert the `NaN` path it
  was clearly written to prevent.
- Money and ratios stay `decimal.js` strings across the IPC per `CLAUDE.md`; implied
  volatility is a ratio and should cross as a formatted string like its siblings, parsed once
  at the edge.

---

## Out of Scope

- **Showing an IV rank in the Context strip.** The `ivRank` prop exists and is never passed;
  wiring it is an enhancement, and the bench's IV rank is a different value from a different
  provider.
- **Collecting Barchart IVR when a position is opened** — see the amendment to US-100.
- Any IV rank derived from Alpaca snapshots. Alpaca publishes per-contract implied volatility
  but no rank or percentile.
- The freshness tiers, rings and tooltips (US-98) — those age an IV _rank_, not a contract's
  implied volatility, and nothing here changes them.
- Historical implied-volatility charting or IV-percentile computation.
- The Theta/Vega/Gamma formulas themselves — this story changes only how an unparseable
  figure is handled.

---

## Dependencies

- **US-39 / US-99:** the Alpaca option-snapshot adapter that already carries
  `impliedVolatility` as far as the mapper
- **Position cockpit (Epic 12 surfaces):** the Context strip this renders in
- **Independent of US-100 and US-104.** Those concern Barchart IV _rank_ and its calendar;
  this is per-contract implied volatility and needs no collector run

---

## Estimate

3 points
