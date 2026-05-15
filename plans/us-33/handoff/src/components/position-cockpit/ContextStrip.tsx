import type { CSSProperties } from 'react'
import { SectionCard } from '../ui/SectionCard'
import { MONO } from '../../lib/tokens'
import { computeDte, fmtMoney } from '../../lib/format'
import { computeThetaYield, type CockpitInput } from '../../lib/verdict'

type ContextStripProps = { input: CockpitInput; ivRank?: number | null }

export function ContextStrip({ input, ivRank }: ContextStripProps): React.JSX.Element | null {
  if (!input.greeks) return null
  const dte = computeDte(input.expiration)
  const theta = computeThetaYield(input, dte)
  if (!theta) return null

  const gammaElevated = dte <= 7 && Math.abs(input.greeks.gamma) >= 0.04

  return (
    <SectionCard header="Context">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 1,
          background: 'var(--wb-border)'
        }}
      >
        <KV
          label="Theta"
          value={`${fmtMoney(String(theta.thetaDollar))}/d`}
          valueColor={theta.yieldPct >= 50 ? 'var(--wb-green)' : 'var(--wb-text-primary)'}
          sub={`${theta.yieldPct.toFixed(0)}% yield over ${dte}d`}
        />
        <KV
          label="IV"
          value={`${(input.greeks.iv * 100).toFixed(1)}%`}
          sub={ivRank != null ? `rank ${ivRank}` : 'implied vol'}
        />
        <KV label="Vega" value={fmtMoney(String(input.greeks.vega * 100))} sub="per 1% IV move" />
        <KV
          label="Gamma"
          value={Math.abs(input.greeks.gamma).toFixed(3)}
          valueColor={gammaElevated ? 'var(--wb-gold)' : 'var(--wb-text-primary)'}
          sub={gammaElevated ? 'elevated near expiry' : 'delta sensitivity'}
        />
      </div>
    </SectionCard>
  )
}

type KVProps = { label: string; value: string; valueColor?: string; sub: string }

function KV({ label, value, valueColor, sub }: KVProps): React.JSX.Element {
  const cellStyle: CSSProperties = {
    background: 'var(--wb-bg-surface)',
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  }
  return (
    <div style={cellStyle}>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--wb-text-muted)'
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: MONO,
          fontSize: 14,
          fontWeight: 600,
          color: valueColor ?? 'var(--wb-text-primary)'
        }}
      >
        {value}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--wb-text-muted)' }}>{sub}</span>
    </div>
  )
}
