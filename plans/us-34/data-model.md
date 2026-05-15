# Data Model: US-34 — Position Cockpit

No new database tables or IPC channels. All data flows through existing hooks and types.

---

## CockpitInput (pure logic input shape)

Defined in `src/renderer/src/lib/verdict.ts`. Assembled in `PositionCockpit.tsx` from `PositionDetail` + `OptionSnapshot` + `underlyingPrice` prop.

```ts
type CockpitInput = {
  instrument: 'SELL PUT' | 'SELL CALL' // derived from position.phase
  expiration: string // activeLeg.expiration
  strike: number // parseFloat(activeLeg.strike)
  contracts: number // activeLeg.contracts
  premiumPerContract: number // parseFloat(activeLeg.premiumPerContract)
  currentMid: number | null // parseFloat(snapshot.mid) or null
  underlying: number | null // parseFloat(underlyingPrice) or null
  greeks: {
    delta: number // parseFloat(snapshot.greeks.delta)
    theta: number // parseFloat(snapshot.greeks.theta)
    gamma: number // parseFloat(snapshot.greeks.gamma)
    vega: number // parseFloat(snapshot.greeks.vega)
    iv: number // parseFloat(snapshot.greeks.iv)  ← NOT snapshot.impliedVolatility
  } | null
  earnings: null // not implemented yet
}
```

---

## Verdict (output of computeVerdict)

```ts
type VerdictKind = 'hold' | 'watch' | 'consider-roll' | 'act-now' | 'target-hit' | 'shares'

type Verdict = {
  kind: VerdictKind
  label: string // 'HOLD' | 'WATCH' | 'CONSIDER ROLL' | 'ACT NOW' | 'TARGET HIT' | 'NO ACTIVE LEG'
  sub: string // one-line reason shown below the pill
  color: string // CSS variable reference: 'var(--wb-green)' | 'var(--wb-gold)' | 'var(--wb-red)' | 'var(--wb-sky)'
}
```

Precedence (first match wins):

1. `dte ≤ 3 && |delta| > 0.50` → ACT NOW (red)
2. `pnl.pct ≥ 50` → TARGET HIT (green)
3. `deltaSeverity === 'danger' || dist.isITM` → CONSIDER ROLL (red)
4. `deltaSeverity === 'warning'` → WATCH (gold)
5. `dte ≤ 21 && dte > 7` → WATCH (gold)
6. otherwise → HOLD (green)

No active leg → `SHARES_VERDICT` constant (sky).

---

## Severity

```ts
type Severity = 'normal' | 'warning' | 'danger'

// deltaSeverity(absDelta, instrument, dte):
// CSP: danger > 0.45 (−0.05 when DTE ≤ 7), warning ≥ 0.30 (−0.05), normal otherwise
// CC:  danger > 0.50 (−0.05 when DTE ≤ 7), warning ≥ 0.35 (−0.05), normal otherwise

// SEVERITY_COLOR: normal → var(--wb-green), warning → var(--wb-gold), danger → var(--wb-red)
```

---

## Derived types

```ts
type Distance = {
  dollars: number // underlying − strike (positive = OTM for CSP)
  pct: number // (raw / strike) × 100
  severity: Severity
  isITM: boolean // raw < 0
}

type Pnl = {
  captured: number // (premiumPerContract − currentMid) × 100 × contracts
  max: number // premiumPerContract × 100 × contracts
  pct: number // (captured / max) × 100
}

type ThetaYield = {
  thetaDollar: number // |theta| × 100 × contracts
  yieldPct: number // (thetaDollar × dte / max) × 100
}
```

---

## PositionCockpit component props

```ts
type PositionCockpitProps = {
  detail: PositionDetail // existing type from api/positions.ts
  snapshot?: OptionSnapshot // existing type from api/market-data.ts
  underlyingPrice?: string | null // new — from useStockQuotes([ticker]).data?.[ticker]?.price
  ivRank?: number | null // future — not implemented, kept for forward compat
}
```

---

## PositionDetailContent updated props

```ts
// adds underlyingPrice to existing props
type PositionDetailContentProps = {
  detail: PositionDetail
  overlayOpen: boolean
  snapshot?: OptionSnapshot
  underlyingPrice?: string | null // new
}
```

---

## No new IPC channels or database tables

All data comes from:

- `usePosition(id)` — existing hook (PositionDetail)
- `useOptionSnapshots(legSummaries)` — existing hook from US-33 (OptionSnapshot + greeks)
- `useStockQuotes([ticker])` — existing hook from US-32 (StockQuote.price)
