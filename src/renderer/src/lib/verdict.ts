// Verdict + severity helpers for the Triage Cockpit position detail.
// Pure functions — no React, no live data.

import type { OptionInstrumentType } from '../../../main/core/types'
import { computeDte } from './format'

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
  instrument: OptionInstrumentType
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
}

// -------- Management rules (future: replace with user preferences) --------

export const MANAGEMENT_RULES = {
  // DTE thresholds
  tightDte: 7, // dte ≤ this shifts delta thresholds tighter and shows TIGHT badge
  actNowDte: 3, // dte ≤ this with high delta → ACT NOW
  managementWindowDte: 21, // dte ≤ this (and > tightDte) → WATCH approaching window

  // Delta thresholds for CSP (SELL PUT)
  cspDangerDelta: 0.45,
  cspWarningDelta: 0.3,

  // Delta thresholds for CC (SELL CALL)
  ccDangerDelta: 0.5,
  ccWarningDelta: 0.35,

  // When dte ≤ tightDte, danger/warning thresholds drop by this amount
  tightDeltaShift: 0.05,

  // P&L capture % at which the 50% rule is met → TARGET HIT
  targetCapturePct: 50,

  // Distance-to-strike buffer % below which severity escalates
  distanceWarningPct: 1.5,

  // Gamma threshold above which the gamma cell turns amber near expiry (dte ≤ tightDte)
  gammaElevatedThreshold: 0.04
} as const

// -------- Severity --------

export function deltaSeverity(
  absDelta: number,
  instrument: OptionInstrumentType,
  dte: number
): Severity {
  const shift = dte <= MANAGEMENT_RULES.tightDte ? MANAGEMENT_RULES.tightDeltaShift : 0
  const { danger, warning } =
    instrument === 'CALL'
      ? { danger: MANAGEMENT_RULES.ccDangerDelta, warning: MANAGEMENT_RULES.ccWarningDelta }
      : { danger: MANAGEMENT_RULES.cspDangerDelta, warning: MANAGEMENT_RULES.cspWarningDelta }
  if (absDelta > danger - shift) return 'danger'
  if (absDelta >= warning - shift) return 'warning'
  return 'normal'
}

export function distanceSeverity(bufferPct: number): Severity {
  if (bufferPct < 0) return 'danger'
  if (bufferPct < MANAGEMENT_RULES.distanceWarningPct) return 'warning'
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
  const isCC = input.instrument === 'CALL'
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

  // 1 — High delta near expiration (may or may not be ITM)
  if (dte <= MANAGEMENT_RULES.actNowDte && absDelta > MANAGEMENT_RULES.ccDangerDelta) {
    const reason = dist.isITM
      ? `ITM with ${dte} day${dte === 1 ? '' : 's'} to expiration`
      : `High delta near expiration (${dte}d)`
    return {
      kind: 'act-now',
      label: 'ACT NOW',
      sub: `${reason} · roll, close, or accept`,
      color: 'var(--wb-red)'
    }
  }
  // 2 — Target hit
  if (pnl.pct >= MANAGEMENT_RULES.targetCapturePct) {
    return {
      kind: 'target-hit',
      label: 'TARGET HIT',
      sub: `${pnl.pct.toFixed(0)}% of max premium captured · ${MANAGEMENT_RULES.targetCapturePct}% rule met`,
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
  if (dte <= MANAGEMENT_RULES.managementWindowDte && dte > MANAGEMENT_RULES.tightDte) {
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

export const WHEEL_COMPLETE_VERDICT: Verdict = {
  kind: 'shares',
  label: 'WHEEL COMPLETE',
  sub: 'Shares called away — start a new wheel or let it rest',
  color: 'var(--wb-green)'
}
