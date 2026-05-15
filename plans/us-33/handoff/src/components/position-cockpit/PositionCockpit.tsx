// Drop-in replacement for PositionDetailContent.
// Wires up the cockpit components against the existing PositionDetail / OptionSnapshot shapes.

import type { OptionSnapshot } from '../../api/market-data'
import type { PositionDetail } from '../../api/positions'
import { PHASE_COLOR, PHASE_LABEL } from '../../lib/phase'
import {
  type CockpitInput,
  computeDistance,
  computePnl,
  computeVerdict,
  SHARES_VERDICT
} from '../../lib/verdict'
import { VerdictBlock } from './VerdictBlock'
import { RiskSnapshot } from './RiskSnapshot'
import { ContextStrip } from './ContextStrip'
import { CollapsedDrawer } from './CollapsedDrawer'
import { StatGrid } from '../ui/Stat'
import { fmtMoney } from '../../lib/format'

type PositionCockpitProps = {
  detail: PositionDetail
  snapshot?: OptionSnapshot
  /** Optional — wire to the IV rank service if/when it exists */
  ivRank?: number | null
}

export function PositionCockpit({
  detail,
  snapshot,
  ivRank
}: PositionCockpitProps): React.JSX.Element {
  const { position, activeLeg, costBasisSnapshot } = detail

  // ── No active leg → shares-only view ────────────────────────────
  if (!activeLeg) {
    return (
      <div className="flex flex-col gap-3">
        <VerdictBlock
          input={asFallbackInput(position.ticker)}
          verdict={SHARES_VERDICT}
          pnl={null}
          ticker={position.ticker}
          phaseLabel={PHASE_LABEL[position.phase]}
          phaseColor={PHASE_COLOR[position.phase]}
        />
        {costBasisSnapshot ? (
          <CollapsedDrawer title="Cost basis & history" fieldCount={3} defaultOpen>
            <StatGrid
              minWidth={140}
              items={[
                {
                  label: 'Effective Basis / Share',
                  value: (
                    <span className="text-wb-sky">{fmtMoney(costBasisSnapshot.basisPerShare)}</span>
                  )
                },
                {
                  label: 'Premium Collected',
                  value: (
                    <span className="text-wb-green">
                      {fmtMoney(costBasisSnapshot.totalPremiumCollected)}
                    </span>
                  )
                }
              ]}
            />
          </CollapsedDrawer>
        ) : null}
      </div>
    )
  }

  const instrument = position.phase === 'CC_OPEN' ? 'SELL CALL' : 'SELL PUT'
  const input: CockpitInput = {
    instrument,
    expiration: activeLeg.expiration,
    strike: parseFloat(activeLeg.strike),
    contracts: activeLeg.contracts,
    premiumPerContract: parseFloat(activeLeg.premiumPerContract),
    currentMid: snapshot ? parseFloat(snapshot.mid) : null,
    underlying: snapshot ? parseFloat(snapshot.underlyingPrice ?? '0') || null : null,
    greeks: snapshot?.greeks
      ? {
          delta: parseFloat(snapshot.greeks.delta),
          theta: parseFloat(snapshot.greeks.theta),
          gamma: parseFloat(snapshot.greeks.gamma),
          vega: parseFloat(snapshot.greeks.vega),
          iv: parseFloat(snapshot.impliedVolatility ?? '0')
        }
      : null,
    earnings: null
  }

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
        phaseLabel={PHASE_LABEL[position.phase]}
        phaseColor={PHASE_COLOR[position.phase]}
      />
      {dist ? <RiskSnapshot input={input} dist={dist} /> : null}
      <ContextStrip input={input} ivRank={ivRank} />

      <CollapsedDrawer title="Leg reference" fieldCount={6}>
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

      {costBasisSnapshot ? (
        <CollapsedDrawer title="Cost basis & history" fieldCount={3}>
          <StatGrid
            minWidth={140}
            items={[
              {
                label: 'Effective Basis / Share',
                value: (
                  <span className="text-wb-sky">{fmtMoney(costBasisSnapshot.basisPerShare)}</span>
                )
              },
              {
                label: 'Premium Collected',
                value: (
                  <span className="text-wb-green">
                    {fmtMoney(costBasisSnapshot.totalPremiumCollected)}
                  </span>
                )
              }
            ]}
          />
        </CollapsedDrawer>
      ) : null}
    </div>
  )
}

// Used only when there's no active leg — keeps the VerdictBlock happy without snapshot fields.
function asFallbackInput(_ticker: string): CockpitInput {
  return {
    instrument: 'SELL PUT',
    expiration: new Date().toISOString().slice(0, 10),
    strike: 0,
    contracts: 0,
    premiumPerContract: 0,
    currentMid: null,
    underlying: null,
    greeks: null,
    earnings: null
  }
}
