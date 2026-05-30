import { MANAGEMENT_RULES, computeThetaYield } from '../../lib/verdict'
import type { CockpitInput } from '../../lib/verdict'
import { computeDte, fmtMoney } from '../../lib/format'
import { SectionCard } from '../ui/SectionCard'

type KVProps = { label: string; value: string; valueClass?: string; sub: string }

function KV({ label, value, valueClass, sub }: KVProps): React.JSX.Element {
  return (
    <div className="bg-wb-bg-surface p-3.5 px-4.5 flex flex-col gap-0.5">
      <span className="font-wb-mono text-[9.5px] font-semibold tracking-[0.12em] uppercase text-wb-text-muted">
        {label}
      </span>
      <span
        className={`font-wb-mono text-sm font-semibold ${valueClass ?? 'text-wb-text-primary'}`}
      >
        {value}
      </span>
      <span className="font-wb-mono text-[10px] text-wb-text-muted">{sub}</span>
    </div>
  )
}

type ContextStripProps = { input: CockpitInput; ivRank?: number | null }

export function ContextStrip({ input, ivRank }: ContextStripProps): React.JSX.Element | null {
  if (!input.greeks) return null

  const dte = computeDte(input.expiration)
  const theta = computeThetaYield(input, dte)
  if (!theta) return null

  const thetaValue = `${fmtMoney(String(theta.thetaDollar))}/d`
  const thetaValueClass =
    theta.yieldPct >= MANAGEMENT_RULES.targetCapturePct ? 'text-wb-green' : 'text-wb-text-primary'

  const iv =
    input.impliedVolatility !== undefined ? input.impliedVolatility : (input.greeks.iv ?? null)
  const ivValue = iv != null ? `${(iv * 100).toFixed(1)}%` : '—'
  const ivSub = ivRank != null ? `rank ${ivRank}` : 'implied vol'

  const vegaValue = fmtMoney(String(input.greeks.vega * 100))

  const gammaElevated =
    dte <= MANAGEMENT_RULES.tightDte &&
    Math.abs(input.greeks.gamma) >= MANAGEMENT_RULES.gammaElevatedThreshold
  const gammaValue = Math.abs(input.greeks.gamma).toFixed(3)
  const gammaValueClass = gammaElevated ? 'text-wb-gold' : 'text-wb-text-primary'
  const gammaSub = gammaElevated ? 'elevated near expiry' : 'delta sensitivity'

  return (
    <SectionCard header="Context">
      <div className="grid grid-cols-4 gap-px bg-wb-border">
        <KV
          label="Theta"
          value={thetaValue}
          valueClass={thetaValueClass}
          sub={`${theta.yieldPct.toFixed(0)}% yield over ${dte}d`}
        />
        <KV label="IV" value={ivValue} sub={ivSub} />
        <KV label="Vega" value={vegaValue} sub="per 1% IV move" />
        <KV label="Gamma" value={gammaValue} valueClass={gammaValueClass} sub={gammaSub} />
      </div>
    </SectionCard>
  )
}
