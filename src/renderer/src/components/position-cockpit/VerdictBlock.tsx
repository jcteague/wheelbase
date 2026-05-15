import type { CockpitInput, Pnl, Verdict } from '../../lib/verdict'
import { computeDte, fmtMoney } from '../../lib/format'
import { PnlBar } from './PnlBar'

type VerdictBlockProps = {
  input: CockpitInput | null
  verdict: Verdict
  pnl: Pnl | null
  ticker: string
  phaseLabel: string
  phaseColor: string
  /** Dim the P&L panel by 50% when the source snapshot is stale (>5 min old). */
  pnlStale?: boolean
}

function dteClass(dte: number): string {
  if (dte <= 3) return 'text-wb-red font-semibold'
  if (dte <= 7) return 'text-wb-gold font-semibold'
  return 'font-semibold'
}

function pnlPctColor(pct: number): string {
  if (pct >= 50) return 'text-wb-green'
  if (pct >= 25) return 'text-wb-gold'
  return 'text-wb-red'
}

function tintBackground(color: string): string {
  return `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, transparent) 0%, var(--wb-bg-surface) 100%)`
}

function tintBorder(color: string, pct: number): string {
  return `1px solid color-mix(in srgb, ${color} ${pct}%, transparent)`
}

function tintFill(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

function PnlSummary({ pnl, stale }: { pnl: Pnl; stale: boolean }): React.JSX.Element {
  const pctColor = pnlPctColor(pnl.pct)
  const pctLabel = pnl.pct.toFixed(0)

  return (
    <div data-testid="pnl-summary" className={`flex flex-col gap-2 ${stale ? 'opacity-50' : ''}`}>
      <div className="flex items-baseline gap-1.5">
        <span className={`font-sans text-[32px] font-bold leading-none ${pctColor}`}>
          {pctLabel}%
        </span>
        <span className="font-sans text-xs text-wb-text-muted">captured</span>
      </div>
      <div className="font-sans text-xs text-wb-text-muted">
        ${pnl.captured.toFixed(0)} of ${pnl.max.toFixed(0)} max
      </div>
      <PnlBar pnl={pnl} />
    </div>
  )
}

export function VerdictBlock({
  input,
  verdict,
  pnl,
  ticker,
  phaseLabel,
  phaseColor,
  pnlStale = false
}: VerdictBlockProps): React.JSX.Element {
  const dte = input ? computeDte(input.expiration) : 0
  const dteCls = dteClass(dte)

  return (
    <div
      className="flex flex-col gap-4 rounded-xl p-[22px]"
      style={{
        background: tintBackground(verdict.color),
        border: tintBorder(verdict.color, 40)
      }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3.5 flex-wrap">
        <span className="font-sans text-[26px] font-bold tracking-[0.02em] text-wb-text-primary">
          {ticker}
        </span>

        {/* Phase pill */}
        <span
          className="font-sans text-xs font-semibold tracking-[0.05em] px-2.5 py-0.5 rounded-full"
          style={{
            background: tintFill(phaseColor, 18),
            color: phaseColor,
            border: tintBorder(phaseColor, 35)
          }}
        >
          {phaseLabel}
        </span>

        {/* Key facts strip — only when an active leg is present */}
        {input && (
          <span className="font-wb-mono text-xs text-wb-text-muted tracking-[0.05em] flex items-center gap-1.5">
            <span className="text-wb-gold">{fmtMoney(String(input.strike))}</span>
            <span>·</span>
            <span className={dteCls}>{dte}d</span>
            {input.underlying != null && (
              <>
                <span>·</span>
                <span>{fmtMoney(String(input.underlying))}</span>
              </>
            )}
          </span>
        )}
      </div>

      {/* Verdict + P&L grid */}
      <div
        className="grid items-center gap-[22px]"
        style={{
          gridTemplateColumns: pnl ? 'minmax(280px, 1.1fr) 1fr' : '1fr'
        }}
      >
        <div className="flex flex-col gap-2">
          {/* Verdict pill */}
          <span
            className="font-sans text-sm font-bold tracking-[0.08em] px-3 py-1 rounded-full self-start"
            style={{
              background: tintFill(verdict.color, 20),
              color: verdict.color,
              border: tintBorder(verdict.color, 40)
            }}
          >
            {verdict.label}
          </span>
          {/* Verdict sub */}
          <span className="font-sans text-sm text-wb-text-muted">{verdict.sub}</span>
        </div>

        {pnl ? <PnlSummary pnl={pnl} stale={pnlStale} /> : null}
      </div>
    </div>
  )
}
