import type { CSSProperties } from 'react'
import { MONO, SANS } from '../../lib/tokens'
import { computeDte, fmtMoney } from '../../lib/format'
import type { CockpitInput, Pnl, Verdict } from '../../lib/verdict'
import { PnlBar } from './PnlBar'

type VerdictBlockProps = {
  input: CockpitInput
  verdict: Verdict
  pnl: Pnl | null
  ticker: string
  phaseLabel: string
  phaseColor: string
}

export function VerdictBlock({
  input,
  verdict,
  pnl,
  ticker,
  phaseLabel,
  phaseColor
}: VerdictBlockProps): React.JSX.Element {
  const dte = computeDte(input.expiration)
  const dteColor =
    dte <= 3 ? 'var(--wb-red)' : dte <= 7 ? 'var(--wb-gold)' : 'var(--wb-text-primary)'

  const containerStyle: CSSProperties = {
    background: `linear-gradient(180deg, color-mix(in srgb, ${verdict.color} 12%, transparent) 0%, var(--wb-bg-surface) 100%)`,
    border: `1px solid color-mix(in srgb, ${verdict.color} 40%, transparent)`,
    borderRadius: 12,
    padding: 22,
    display: 'flex',
    flexDirection: 'column',
    gap: 18
  }

  const phasePillStyle: CSSProperties = {
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.08em',
    padding: '3px 9px',
    borderRadius: 3,
    background: `color-mix(in srgb, ${phaseColor} 18%, transparent)`,
    color: phaseColor,
    border: `1px solid color-mix(in srgb, ${phaseColor} 30%, transparent)`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap'
  }

  const verdictPillStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 14px 6px 12px',
    background: `color-mix(in srgb, ${verdict.color} 22%, transparent)`,
    border: `1px solid color-mix(in srgb, ${verdict.color} 50%, transparent)`,
    borderRadius: 999,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.18em',
    color: verdict.color,
    marginBottom: 12
  }

  return (
    <div style={containerStyle}>
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <span
          style={{
            fontFamily: SANS,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: 'var(--wb-text-primary)'
          }}
        >
          {ticker}
        </span>
        <span style={phasePillStyle}>
          <span
            style={{ width: 5, height: 5, borderRadius: '50%', background: phaseColor }}
            aria-hidden
          />
          {phaseLabel}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 12,
            color: 'var(--wb-text-muted)',
            letterSpacing: '0.05em'
          }}
        >
          <span style={{ color: 'var(--wb-gold)' }}>{fmtMoney(String(input.strike))}</span>
          <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
          <span style={{ color: dteColor, fontWeight: 600 }}>{dte}d</span>
          {input.underlying != null ? (
            <>
              <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
              {fmtMoney(String(input.underlying))}
            </>
          ) : null}
        </span>
      </div>

      {/* Verdict + P&L row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: pnl ? 'minmax(280px, 1.1fr) 1fr' : '1fr',
          gap: 22,
          alignItems: 'center'
        }}
      >
        <div>
          <div style={verdictPillStyle}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: verdict.color,
                boxShadow: `0 0 0 3px color-mix(in srgb, ${verdict.color} 30%, transparent)`
              }}
              aria-hidden
            />
            {verdict.label}
          </div>
          <div
            style={{
              fontFamily: SANS,
              fontSize: 14.5,
              color: 'var(--wb-text-primary)',
              lineHeight: 1.45,
              maxWidth: 380
            }}
          >
            {verdict.sub}
          </div>
        </div>

        {pnl ? <PnlSummary pnl={pnl} /> : null}
      </div>
    </div>
  )
}

function PnlSummary({ pnl }: { pnl: Pnl }): React.JSX.Element {
  const color =
    pnl.pct >= 50 ? 'var(--wb-green)' : pnl.pct >= 0 ? 'var(--wb-gold)' : 'var(--wb-red)'
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: 'var(--wb-text-muted)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase'
          }}
        >
          P&L · 50% target
        </span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--wb-text-secondary)' }}>
          {pnl.captured >= 0 ? '+' : '−'}${Math.abs(pnl.captured).toFixed(0)} of $
          {pnl.max.toFixed(0)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 30,
            fontWeight: 700,
            color,
            lineHeight: 1
          }}
        >
          {pnl.pct.toFixed(0)}%
        </span>
        <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--wb-text-muted)' }}>
          captured
        </span>
      </div>
      <PnlBar pnl={pnl} height={8} />
    </div>
  )
}
