import { MANAGEMENT_RULES, SEVERITY_COLOR, deltaSeverity } from '../../lib/verdict'
import type { CockpitInput, Distance, Severity } from '../../lib/verdict'
import { computeDte, fmtMoney } from '../../lib/format'
import { SectionCard } from '../ui/SectionCard'
import { DeltaGauge } from './DeltaGauge'
import { DistanceThermo } from './DistanceThermo'

type RiskSnapshotProps = { input: CockpitInput; dist: Distance | null }

function severityReading(sev: Severity): string {
  switch (sev) {
    case 'danger':
      return 'High — strike likely breached'
    case 'warning':
      return 'Moderate — monitor for breach'
    default:
      return 'Low — comfortably out of the money'
  }
}

function formatDollars(value: number): string {
  const sign = value >= 0 ? '+' : '−'
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : '−'
  return `(${sign}${Math.abs(value).toFixed(1)}%)`
}

export function RiskSnapshot({ input, dist }: RiskSnapshotProps): React.JSX.Element | null {
  if (!input.greeks) return null

  const dte = computeDte(input.expiration)
  const tight = dte <= MANAGEMENT_RULES.tightDte
  const absDelta = Math.abs(input.greeks.delta)
  const sev = deltaSeverity(absDelta, input.instrument, dte)
  const deltaColor = SEVERITY_COLOR[sev]

  const probLabel = input.instrument === 'CALL' ? 'Call-away probability' : 'Assignment probability'
  const reading = severityReading(sev)

  return (
    <SectionCard header="Risk snapshot">
      <div className={`grid gap-px bg-wb-border ${dist ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Left cell: Delta gauge + label stack */}
        <div className="bg-wb-bg-surface px-[22px] py-5">
          <div className="flex flex-row items-center gap-4">
            <DeltaGauge absDelta={absDelta} color={deltaColor} tight={tight} />
            <div className="flex flex-col gap-1">
              <span className="font-wb-mono text-[9px] tracking-[0.1em] text-wb-text-muted uppercase">
                {probLabel}
              </span>
              <span
                className="font-wb-mono text-[11px] tracking-[0.05em]"
                style={{ color: deltaColor }}
              >
                {reading}
              </span>
            </div>
          </div>
        </div>

        {/* Right cell: Distance to strike — only when underlying price is available */}
        {dist && input.underlying != null && (
          <div className="bg-wb-bg-surface px-[22px] py-5">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-baseline">
                <span className="font-wb-mono text-[9px] tracking-[0.1em] text-wb-text-muted uppercase">
                  Distance to strike
                </span>
                <span className="font-wb-mono text-xs text-wb-text-secondary">
                  {fmtMoney(String(input.underlying))} vs {fmtMoney(String(input.strike))}
                </span>
              </div>
              <div className="flex flex-row items-baseline gap-2">
                <span
                  className="font-wb-mono text-[26px] font-bold leading-none"
                  style={{ color: SEVERITY_COLOR[dist.severity] }}
                >
                  {formatDollars(dist.dollars)}
                </span>
                <span
                  className="font-wb-mono text-[13px]"
                  style={{ color: SEVERITY_COLOR[dist.severity] }}
                >
                  {formatPct(dist.pct)}
                </span>
              </div>
              <DistanceThermo dist={dist} />
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
