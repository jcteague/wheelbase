// Verdict + severity helpers for the Triage Cockpit position detail.
// Pure functions — no React, no live data.

import { computeDte } from './format'

export type InstrumentLabel = 'SELL PUT' | 'SELL CALL'
export type Severity = 'normal' | 'warning' | 'danger'

export type VerdictKind = 'hold' | 'watch' | 'consider-roll' | 'act-now' | 'target-hit' | 'shares'

export type Verdict = {
  kind: VerdictKind
  label: string
  sub: string
  /** CSS color token reference, e.g. "var(--wb-red)" */
  color: string
}

export type CockpitInput = {
  instrument: InstrumentLabel
  expiration: string
  strike: number
  contracts: number
  /** premium per share, per contract — same units as `currentMid` */
  premiumPerContract: number
  /** current option mid */
  currentMid: number | null
  /** spot price for the underlying */
  underlying: number | null
  /** greeks from option snapshot */
  greeks: { delta: number; theta: number; gamma: number; vega: number; iv: number } | null
  /** optional earnings hint */
  earnings: { date: string; daysAway: number } | null
}

// -------- Severity --------

export function deltaSeverity(
  absDelta: number,
  instrument: InstrumentLabel,
  dte: number
): Severity {
  const shift = dte <= 7 ? 0.05 : 0
  const isCall = instrument === 'SELL CALL'
  if (isCall) {
    if (absDelta > 0.5 - shift) return 'danger'
    if (absDelta >= 0.35 - shift) return 'warning'
    return 'normal'
  }
  if (absDelta > 0.45 - shift) return 'danger'
  if (absDelta >= 0.3 - shift) return 'warning'
  return 'normal'
}

export function distanceSeverity(bufferPct: number): Severity {
  if (bufferPct < 0) return 'danger'
  if (bufferPct < 1.5) return 'warning'
  return 'normal'
}

export const SEVERITY_COLOR: Record<Severity, string> = {
  normal: 'var(--wb-green)',
  warning: 'var(--wb-gold)',
  danger: 'var(--wb-red)'
}

// -------- Derivations --------

export type Distance = {
  dollars: number
  pct: number
  severity: Severity
  isITM: boolean
}

export function computeDistance(input: CockpitInput): Distance | null {
  if (input.underlying == null) return null
  const isCC = input.instrument === 'SELL CALL'
  const raw = isCC ? input.strike - input.underlying : input.underlying - input.strike
  const pct = (raw / input.strike) * 100
  return {
    dollars: raw,
    pct,
    severity: distanceSeverity(pct),
    isITM: raw < 0
  }
}

export type Pnl = { captured: number; max: number; pct: number }

export function computePnl(input: CockpitInput): Pnl | null {
  if (input.currentMid == null) return null
  const captured = (input.premiumPerContract - input.currentMid) * 100 * input.contracts
  const max = input.premiumPerContract * 100 * input.contracts
  const pct = max > 0 ? (captured / max) * 100 : 0
  return { captured, max, pct }
}

export type ThetaYield = { thetaDollar: number; yieldPct: number }

export function computeThetaYield(input: CockpitInput, dte: number): ThetaYield | null {
  if (!input.greeks) return null
  const thetaDollar = Math.abs(input.greeks.theta) * 100 * input.contracts
  const max = input.premiumPerContract * 100 * input.contracts
  const yieldPct = max > 0 ? ((thetaDollar * dte) / max) * 100 : 0
  return { thetaDollar, yieldPct }
}

// -------- Verdict --------

export function computeVerdict(input: CockpitInput): Verdict {
  if (!input.greeks || input.currentMid == null || input.underlying == null) {
    return {
      kind: 'hold',
      label: 'HOLD',
      sub: 'Awaiting market data',
      color: 'var(--wb-green)'
    }
  }
  const dte = computeDte(input.expiration)
  const pnl = computePnl(input)!
  const dist = computeDistance(input)!
  const absDelta = Math.abs(input.greeks.delta)

  // 1 — ITM near expiration
  if (dte <= 3 && absDelta > 0.5) {
    return {
      kind: 'act-now',
      label: 'ACT NOW',
      sub: `ITM with ${dte} day${dte === 1 ? '' : 's'} to expiration · roll, close, or accept`,
      color: 'var(--wb-red)'
    }
  }
  // 2 — Target hit
  if (pnl.pct >= 50) {
    return {
      kind: 'target-hit',
      label: 'TARGET HIT',
      sub: `${pnl.pct.toFixed(0)}% of max premium captured · 50% rule met`,
      color: 'var(--wb-green)'
    }
  }
  // 3 — Danger delta or ITM
  const sev = deltaSeverity(absDelta, input.instrument, dte)
  if (sev === 'danger' || dist.isITM) {
    const reason = dist.isITM
      ? `ITM by $${Math.abs(dist.dollars).toFixed(2)}`
      : 'High assignment risk'
    return {
      kind: 'consider-roll',
      label: 'CONSIDER ROLL',
      sub: `${reason} · evaluate roll for credit`,
      color: 'var(--wb-red)'
    }
  }
  // 4 — Warning delta
  if (sev === 'warning') {
    return {
      kind: 'watch',
      label: 'WATCH',
      sub: 'Delta in management band · monitor for breach',
      color: 'var(--wb-gold)'
    }
  }
  // 5 — Approaching management window
  if (dte <= 21 && dte > 7) {
    return {
      kind: 'watch',
      label: 'WATCH',
      sub: `Approaching management window · ${dte} DTE`,
      color: 'var(--wb-gold)'
    }
  }
  // 6 — Hold
  return {
    kind: 'hold',
    label: 'HOLD',
    sub: 'Position tracking to plan · no action required',
    color: 'var(--wb-green)'
  }
}

export const SHARES_VERDICT: Verdict = {
  kind: 'shares',
  label: 'NO ACTIVE LEG',
  sub: 'Sell a covered call to begin the next cycle',
  color: 'var(--wb-sky)'
}
