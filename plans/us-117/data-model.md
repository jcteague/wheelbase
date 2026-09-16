# Data Model: US-117 — Position implied volatility

No database entity changes. No migration. This story changes **type shapes at the IPC
boundary** and the **display rules** of one renderer component. Everything below is
in-memory.

---

## 1. `OptionSnapshot` — the shape that crosses the IPC

The main-process definition is the source of truth and is **already correct**. Two
hand-written mirrors must be brought into agreement with it.

### Source of truth (unchanged by this story)

`src/main/integrations/market-data-provider.ts:35`

```typescript
export type OptionSnapshot = {
  bid: string
  ask: string
  mid: string
  lastTrade: string
  openInterest: number | null
  volume: number | null
  greeks?: {
    delta: string
    gamma: string
    theta: string
    vega: string
  }
  impliedVolatility?: string // 4dp decimal string, e.g. '0.2840'
  timestamp: string
}
```

### Mirror A — `src/preload/index.d.ts:243`

| Field               | Before                 | After                        |
| ------------------- | ---------------------- | ---------------------------- |
| `greeks`            | required               | `greeks?:` — optional        |
| `greeks.iv`         | `iv: string`, required | **deleted**                  |
| `impliedVolatility` | absent                 | `impliedVolatility?: string` |

### Mirror B — `src/renderer/src/api/market-data.ts:21`

| Field                              | Before                 | After                        |
| ---------------------------------- | ---------------------- | ---------------------------- |
| `OptionGreeks.iv`                  | `iv: string`, required | **deleted**                  |
| `OptionSnapshot.greeks`            | `greeks: OptionGreeks` | `greeks?: OptionGreeks`      |
| `OptionSnapshot.impliedVolatility` | absent                 | `impliedVolatility?: string` |

**Availability rules** (enforced by the producer, see §3):

- `greeks` is present **only** when all four of delta/gamma/theta/vega are finite numbers.
  A partial or non-finite set is dropped whole.
- `impliedVolatility` is present **only** when Alpaca sent a finite number. It is
  independent of `greeks` — either may be present without the other.
- Neither is ever `null` and neither is ever the string `"NaN"`.

---

## 2. `CockpitInput` — the renderer's parsed form

`src/renderer/src/lib/verdict.ts:19`

```typescript
export type CockpitInput = {
  instrument: OptionInstrumentType
  expiration: string
  strike: number
  contracts: number
  premiumPerContract: number
  currentMid: number | null
  underlying: number | null
  /** all four present or the whole block is null — never a partial set */
  greeks: { delta: number; theta: number; gamma: number; vega: number } | null
  /** implied volatility as a decimal (0.284 = 28.4%); a sibling of greeks, not a member */
  impliedVolatility: number | null
}
```

Changes from today:

| Field               | Before                               | After                               | Why                                                                                            |
| ------------------- | ------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `greeks.iv`         | `iv?: number`                        | **deleted**                         | IV is not a Greek (research ADR 1)                                                             |
| `impliedVolatility` | `impliedVolatility?: number \| null` | `impliedVolatility: number \| null` | required-and-nullable, so `buildCockpitInput` cannot compile without deciding (research ADR 2) |

Every numeric field is produced by `parseFinite` (§4); none can hold `NaN`.

---

## 3. Producer validation rules

`src/main/integrations/alpaca-market-data-mappers.ts`

| Rule                | Location                   | Before                                       | After                                     |
| ------------------- | -------------------------- | -------------------------------------------- | ----------------------------------------- |
| Greeks completeness | `isCompleteGreeks`, `:104` | `typeof g.delta === 'number'` (× 4)          | `Number.isFinite(g.delta)` (× 4)          |
| IV presence         | `mapOptionQuote`, `:145`   | `typeof snap.impliedVolatility === 'number'` | `Number.isFinite(snap.impliedVolatility)` |

`typeof NaN === 'number'` is `true`, so both predicates admit `NaN` today and
`new Decimal(NaN).toFixed(4)` emits the string `"NaN"` across the IPC.

### New pure helper — `nonFiniteFigures`

```typescript
/** Field names that Alpaca sent as a number but which cannot be used (NaN / Infinity). */
export function nonFiniteFigures(snap: AlpacaOptionSnapshot): string[]
```

- Returns `[]` for a clean snapshot and for one that simply **omits** a figure — an absent
  field is not a defect, it is the normal case.
- Returns e.g. `['impliedVolatility']` or `['greeks.delta', 'greeks.vega']` when a field is
  present with a non-finite value.
- Pure: no logging, no I/O. The adapter logs; the mapper stays total (`mappers.ts:1-4`).

---

## 4. Renderer parse helper

`src/renderer/src/lib/format.ts`

```typescript
/** A finite number, or null for absent, empty, or unparseable input. Never NaN. */
export function parseFinite(value: string | null | undefined): number | null
```

| Input                            | Output                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `'0.2840'`                       | `0.284`                                                                        |
| `'0'`                            | `0` — a legitimate delta, deliberately not swallowed the way `\|\| null` would |
| `'-0.05'`                        | `-0.05`                                                                        |
| `undefined` / `null` / `''`      | `null`                                                                         |
| `'NaN'` / `'abc'` / `'Infinity'` | `null`                                                                         |

Replaces the six bare `parseFloat` calls in `buildCockpitInput`
(`PositionCockpit.tsx:232-240`), including the hand-rolled
`parseFloat(underlyingPrice) || null` at `:232`.

---

## 5. Context strip display rules

`src/renderer/src/components/position-cockpit/ContextStrip.tsx`

**The render gate is unchanged.** Both early returns stay: `if (!input.greeks) return null`
(`:27`) and `if (!theta) return null` (`:31`). A contract with no complete Greek set shows no
strip at all, preserving the shipped US-34 behaviour (`e2e/position-cockpit.spec.ts:592`,
`ContextStrip.spec.tsx:39`). See `research.md` ADR 5 for why, and for the two ACs this
satisfies in spirit rather than literally.

What changes is the **IV cell only**. Implied volatility is a sibling of `greeks`, so it can
be absent while the strip is rendering, and it is the one cell that must dash on its own:

| Cell  | Value                                 | Sub                                                            | Changed by this story                                       |
| ----- | ------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------- |
| Theta | `fmtMoney(thetaDollar)` + `/d`        | `{yieldPct}% yield over {dte}d`                                | no                                                          |
| IV    | `(iv * 100).toFixed(1)` + `%`, or `—` | `implied vol`, or `rank {ivRank}` when the prop is passed      | **yes** — reads `impliedVolatility`; dashes when it is null |
| Vega  | `fmtMoney(vega * 100)`                | `per 1% IV move`                                               | no                                                          |
| Gamma | `abs(gamma).toFixed(3)`               | `elevated near expiry` when elevated, else `delta sensitivity` | no                                                          |

The IV cell reads `—` when `input.impliedVolatility` is `null` — which now covers every path
that used to produce `NaN%`: the provider omitted the figure, sent a non-finite one (dropped
at the mapper, §3), or sent nothing at all. The `greeks.iv` fallback at `ContextStrip.tsx:38`
is deleted, and the `iv != null` guard is unnecessary once `parseFinite` (§4) guarantees the
field is a finite number or `null`.

Theta, Vega and Gamma are unreachable with a non-finite value, because `greeks` is
all-or-nothing (§3, and `research.md` ADR 4): one bad Greek nulls the whole block, and a null
block means no strip. Colour rules are unchanged — `text-wb-green` on Theta at or above
`MANAGEMENT_RULES.targetCapturePct`, `text-wb-gold` on an elevated Gamma inside
`MANAGEMENT_RULES.tightDte`. A dashed IV cell takes the default `text-wb-text-primary`.

`PositionCockpit` returns before the strip when there is no active leg (`:46-76`), so
HOLDING_SHARES and WHEEL_COMPLETE show no strip — also unchanged. `RiskSnapshot` keeps its
own `!input.greeks` gate (`RiskSnapshot.tsx:32`).

---

## 6. State transitions

None. No phase, no lifecycle, no persisted row is touched by this story.
