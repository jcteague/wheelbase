import type { OptionSnapshot } from '../../api/market-data'
import type { LegDetail, PositionDetail, SnapshotDetail } from '../../api/positions'
import type { LegHistoryEntry } from '../../lib/rollGroups'
import { isOptionInstrument } from '../../../../main/core/types'
import { PHASE_COLOR, PHASE_LABEL } from '../../lib/phase'
import {
  type CockpitInput,
  computeDistance,
  computePnl,
  computeVerdict,
  SHARES_VERDICT,
  WHEEL_COMPLETE_VERDICT
} from '../../lib/verdict'
import { deriveRunningBasis } from '../../lib/deriveRunningBasis'
import { fmtMoney } from '../../lib/format'
import { VerdictBlock } from './VerdictBlock'
import { RiskSnapshot } from './RiskSnapshot'
import { ContextStrip } from './ContextStrip'
import { CollapsedDrawer } from './CollapsedDrawer'
import { SectionCard } from '../ui/SectionCard'
import { StatGrid } from '../ui/Stat'
import { LegHistoryTable } from '../LegHistoryTable'

type PositionCockpitProps = {
  detail: PositionDetail
  snapshot?: OptionSnapshot
  underlyingPrice?: string | null
  ivRank?: number | null
  /** Dim the P&L panel when the option snapshot is older than the staleness threshold. */
  pnlStale?: boolean
}

export function PositionCockpit({
  detail,
  snapshot,
  underlyingPrice,
  ivRank,
  pnlStale
}: PositionCockpitProps): React.JSX.Element {
  const { position, activeLeg, costBasisSnapshot, legs, allSnapshots } = detail
  const phaseLabel = PHASE_LABEL[position.phase]
  const phaseColor = PHASE_COLOR[position.phase]
  const enrichedLegs = deriveRunningBasis(legs, allSnapshots ?? [])
  const cycles = legs.filter((leg) => leg.legRole === 'CALLED_AWAY').length

  if (!activeLeg) {
    const noLegVerdict =
      position.phase === 'WHEEL_COMPLETE' ? WHEEL_COMPLETE_VERDICT : SHARES_VERDICT
    const assignLeg = legs.find((leg) => leg.legRole === 'ASSIGN')
    const showPositionCard = position.phase === 'HOLDING_SHARES' && assignLeg && costBasisSnapshot
    return (
      <div className="flex flex-col gap-3">
        <VerdictBlock
          input={null}
          verdict={noLegVerdict}
          pnl={null}
          ticker={position.ticker}
          phaseLabel={phaseLabel}
          phaseColor={phaseColor}
        />
        {showPositionCard && (
          <PositionStatsCard
            assignLeg={assignLeg}
            snapshot={costBasisSnapshot}
            underlyingPrice={underlyingPrice ?? null}
          />
        )}
        <CostBasisDrawer
          snapshot={costBasisSnapshot}
          enrichedLegs={enrichedLegs}
          cycles={cycles}
          defaultOpen
        />
      </div>
    )
  }

  const input = buildCockpitInput({ activeLeg, snapshot, underlyingPrice })
  const verdict = computeVerdict(input)
  const pnl = computePnl(input)
  const dist = computeDistance(input)

  return (
    <div className="flex flex-col gap-3">
      <VerdictBlock
        input={input}
        verdict={verdict}
        pnl={pnl}
        ticker={position.ticker}
        phaseLabel={phaseLabel}
        phaseColor={phaseColor}
        pnlStale={pnlStale}
      />
      {input.greeks ? <RiskSnapshot input={input} dist={dist} /> : null}
      <ContextStrip input={input} ivRank={ivRank} />

      <CollapsedDrawer title="Leg reference" fieldCount={snapshot ? 6 : 5}>
        <StatGrid
          minWidth={130}
          items={[
            {
              label: 'Strike',
              value: <span className="text-wb-gold">{fmtMoney(activeLeg.strike)}</span>
            },
            { label: 'Expiration', value: activeLeg.expiration },
            { label: 'Contracts', value: activeLeg.contracts },
            {
              label: 'Premium / Contract',
              value: <span className="text-wb-green">{fmtMoney(activeLeg.premiumPerContract)}</span>
            },
            { label: 'Fill Date', value: activeLeg.fillDate },
            ...(snapshot ? [{ label: 'Current Mid', value: fmtMoney(snapshot.mid) }] : [])
          ]}
        />
      </CollapsedDrawer>

      <CostBasisDrawer snapshot={costBasisSnapshot} enrichedLegs={enrichedLegs} cycles={cycles} />
    </div>
  )
}

type CostBasisDrawerProps = {
  snapshot: SnapshotDetail | null
  enrichedLegs?: LegHistoryEntry[]
  cycles: number
  defaultOpen?: boolean
}

function CostBasisDrawer({
  snapshot,
  enrichedLegs = [],
  cycles,
  defaultOpen = false
}: CostBasisDrawerProps): React.JSX.Element | null {
  if (!snapshot) return null

  return (
    <CollapsedDrawer title="Cost basis & history" fieldCount={3} defaultOpen={defaultOpen}>
      <StatGrid
        minWidth={140}
        items={[
          {
            label: 'Effective Basis / Share',
            value: <span className="text-wb-sky">{fmtMoney(snapshot.basisPerShare)}</span>
          },
          {
            label: 'Premium Collected',
            value: <span className="text-wb-green">{fmtMoney(snapshot.totalPremiumCollected)}</span>
          },
          { label: 'Cycles', value: cycles }
        ]}
      />
      {enrichedLegs.length > 0 ? (
        <LegHistoryTable legs={enrichedLegs} finalPnl={snapshot.finalPnl ?? null} />
      ) : null}
    </CollapsedDrawer>
  )
}

type PositionStatsCardProps = {
  assignLeg: LegDetail
  snapshot: SnapshotDetail
  underlyingPrice: string | null
}

function formatSignedMoney(value: number): string {
  const sign = value >= 0 ? '+' : '−'
  return `${sign}$${Math.abs(value).toFixed(2)}`
}

function PositionStatsCard({
  assignLeg,
  snapshot,
  underlyingPrice
}: PositionStatsCardProps): React.JSX.Element {
  const shares = assignLeg.contracts * 100
  const basis = parseFloat(snapshot.basisPerShare)
  const current = underlyingPrice ? parseFloat(underlyingPrice) : null
  const unrealized = current != null ? (current - basis) * shares : null
  const unrealizedClass = unrealized != null && unrealized >= 0 ? 'text-wb-green' : 'text-wb-red'

  return (
    <SectionCard header="Position">
      <StatGrid
        minWidth={130}
        items={[
          { label: 'Shares', value: shares },
          {
            label: 'Avg Basis',
            value: <span className="text-wb-sky">{fmtMoney(snapshot.basisPerShare)}</span>
          },
          ...(current != null
            ? [
                { label: 'Current', value: fmtMoney(String(current)) },
                {
                  label: 'Unrealized',
                  value: (
                    <span className={unrealizedClass}>{formatSignedMoney(unrealized ?? 0)}</span>
                  )
                }
              ]
            : [])
        ]}
      />
    </SectionCard>
  )
}

type BuildCockpitInputArgs = {
  activeLeg: LegDetail
  snapshot: OptionSnapshot | undefined
  underlyingPrice: string | null | undefined
}

function buildCockpitInput({
  activeLeg,
  snapshot,
  underlyingPrice
}: BuildCockpitInputArgs): CockpitInput {
  if (!isOptionInstrument(activeLeg.instrumentType)) {
    throw new Error(
      `Active leg instrumentType must be PUT or CALL, got ${activeLeg.instrumentType}`
    )
  }
  return {
    instrument: activeLeg.instrumentType,
    expiration: activeLeg.expiration,
    strike: parseFloat(activeLeg.strike),
    contracts: activeLeg.contracts,
    premiumPerContract: parseFloat(activeLeg.premiumPerContract),
    currentMid: snapshot ? parseFloat(snapshot.mid) : null,
    underlying: underlyingPrice ? parseFloat(underlyingPrice) || null : null,
    greeks: snapshot?.greeks
      ? {
          delta: parseFloat(snapshot.greeks.delta),
          theta: parseFloat(snapshot.greeks.theta),
          gamma: parseFloat(snapshot.greeks.gamma),
          vega: parseFloat(snapshot.greeks.vega),
          iv: parseFloat(snapshot.greeks.iv)
        }
      : null
  }
}
