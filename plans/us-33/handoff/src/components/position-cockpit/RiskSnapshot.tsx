import type { CSSProperties } from 'react'
import { SectionCard } from '../ui/SectionCard'
import { MONO } from '../../lib/tokens'
import { computeDte, fmtMoney } from '../../lib/format'
import { type CockpitInput, type Distance, SEVERITY_COLOR, deltaSeverity } from '../../lib/verdict'
import { DeltaGauge } from './DeltaGauge'
import { DistanceThermo } from './DistanceThermo'

type RiskSnapshotProps = { input: CockpitInput; dist: Distance }

export function RiskSnapshot({ input, dist }: RiskSnapshotProps): React.JSX.Element | null {
  if (!input.greeks) return null
  const dte = computeDte(input.expiration)
  const absDelta = Math.abs(input.greeks.delta)
  const sev = deltaSeverity(absDelta, input.instrument, dte)
  const color = SEVERITY_COLOR[sev]
  const distColor = SEVERITY_COLOR[dist.severity]
  const probLabel =
    input.instrument === 'SELL CALL' ? 'Call-away probability' : 'Assignment probability'
  const reading =
    sev === 'danger'
      ? 'High — strike likely breached'
      : sev === 'warning'
        ? 'Moderate — monitor for breach'
        : 'Low — comfortably out of the money'

  const gridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 1,
    background: 'var(--wb-border)'
  }
  const cellStyle: CSSProperties = {
    background: 'var(--wb-bg-surface)',
    padding: '20px 22px'
  }

  return (
    <SectionCard header="Risk snapshot">
      <div style={gridStyle}>
        <div style={{ ...cellStyle, display: 'flex', alignItems: 'center', gap: 18 }}>
          <DeltaGauge absDelta={absDelta} color={color} tight={dte <= 7} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: 'var(--wb-text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase'
              }}
            >
              {probLabel}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: 'var(--wb-text-secondary)',
                lineHeight: 1.5,
                maxWidth: 200
              }}
            >
              {reading}
              {dte <= 7 ? '. Threshold tightened (DTE ≤ 7).' : ''}
            </div>
          </div>
        </div>
        <div style={cellStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 8
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: 'var(--wb-text-muted)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase'
              }}
            >
              Distance to strike
            </span>
            {input.underlying != null ? (
              <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--wb-text-secondary)' }}>
                {fmtMoney(String(input.underlying))} vs {fmtMoney(String(input.strike))}
              </span>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 26,
                fontWeight: 700,
                color: distColor,
                lineHeight: 1
              }}
            >
              {dist.dollars >= 0 ? '+' : '−'}${Math.abs(dist.dollars).toFixed(2)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: distColor }}>
              ({dist.pct >= 0 ? '+' : '−'}
              {Math.abs(dist.pct).toFixed(1)}%)
            </span>
          </div>
          <DistanceThermo dist={dist} />
        </div>
      </div>
    </SectionCard>
  )
}
