import { computeDte, fmtMoney } from '../lib/format'
import { getCcRollTypeLabel, rollCreditDebitColors } from '../lib/rolls'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetHeader } from './ui/Sheet'
import { SummaryRow } from './ui/SummaryRow'

export type RollCcResponse = {
  position: { id: string; ticker: string; phase: 'CC_OPEN'; status: 'ACTIVE' }
  rollFromLeg: {
    id: string
    legRole: 'ROLL_FROM'
    action: 'BUY'
    instrumentType: string
    strike: string
    expiration: string
    contracts: number
    premiumPerContract: string
    fillDate: string
  }
  rollToLeg: {
    id: string
    legRole: 'ROLL_TO'
    action: 'SELL'
    instrumentType: string
    strike: string
    expiration: string
    contracts: number
    premiumPerContract: string
    fillDate: string
  }
  rollChainId: string
  costBasisSnapshot: {
    id: string
    positionId: string
    basisPerShare: string
    totalPremiumCollected: string
    finalPnl: null
    snapshotAt: string
    createdAt: string
  }
}

type RollCcSuccessProps = {
  response: RollCcResponse
  ticker: string
  prevBasisPerShare: string
  onClose: () => void
}

export function RollCcSuccess({
  response,
  ticker,
  prevBasisPerShare,
  onClose
}: RollCcSuccessProps): React.JSX.Element {
  const fromPremium = parseFloat(response.rollFromLeg.premiumPerContract)
  const toPremium = parseFloat(response.rollToLeg.premiumPerContract)
  const net = toPremium - fromPremium
  const isCredit = net >= 0
  const sign = isCredit ? '+' : '-'
  const total = Math.abs(net) * response.rollToLeg.contracts * 100
  const { color: heroColor, border: heroBorder } = rollCreditDebitColors(isCredit)
  const heroBg = isCredit
    ? 'linear-gradient(135deg, var(--wb-green-subtle), var(--wb-bg-base))'
    : 'linear-gradient(135deg, var(--wb-gold-subtle), var(--wb-bg-base))'
  const newBasis = response.costBasisSnapshot.basisPerShare
  const rollType = getCcRollTypeLabel({
    currentStrike: response.rollFromLeg.strike,
    newStrike: response.rollToLeg.strike,
    currentExpiration: response.rollFromLeg.expiration,
    newExpiration: response.rollToLeg.expiration
  })
  const dte = computeDte(response.rollToLeg.expiration)

  return (
    <>
      <SheetHeader
        eyebrow="Roll Complete"
        title="CC Rolled Successfully"
        subtitle={`${ticker} CALL ${fmtMoney(response.rollFromLeg.strike)} → CALL ${fmtMoney(response.rollToLeg.strike)}`}
        onClose={onClose}
        eyebrowColor={heroColor}
        borderBottomColor={heroBorder}
      />

      <SheetBody>
        <div
          className={isCredit ? 'bg-wb-green-dim' : 'bg-wb-gold-dim'}
          style={{
            background: heroBg,
            border: `1px solid ${heroBorder}`,
            borderRadius: 10,
            padding: '22px 20px',
            textAlign: 'center'
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: heroColor,
              opacity: 0.75,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 8,
              fontFamily: 'var(--font-wb-mono)'
            }}
          >
            {isCredit ? 'Roll Net Credit' : 'Roll Net Debit'}
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 700,
              color: heroColor,
              letterSpacing: '-0.03em',
              lineHeight: 1,
              marginBottom: 6
            }}
          >
            {sign}${Math.abs(net).toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: heroColor, opacity: 0.55 }}>
            ${total.toFixed(2)} total · {response.rollToLeg.contracts} contract
          </div>
        </div>

        <SectionCard>
          <div className="px-4 py-3 flex flex-col gap-2">
            <SummaryRow label="Roll type" value={rollType} />
            <SummaryRow
              label="Old leg"
              value={`Roll From · BUY CALL ${fmtMoney(response.rollFromLeg.strike)} @ ${fmtMoney(response.rollFromLeg.premiumPerContract)}`}
            />
            <SummaryRow
              label="New leg"
              value={`Roll To · SELL CALL ${fmtMoney(response.rollToLeg.strike)} @ ${fmtMoney(response.rollToLeg.premiumPerContract)}`}
            />
            <SummaryRow
              label="New expiration"
              value={`${response.rollToLeg.expiration} (${dte} DTE)`}
            />
            <SummaryRow label="Roll chain ID" value={response.rollChainId.slice(0, 8)} />
            <SummaryRow label="Phase" value="CC Open (unchanged)" />
            <SummaryRow
              label="Cost basis"
              value={`${fmtMoney(prevBasisPerShare)} → ${fmtMoney(newBasis)}/share`}
              highlight
            />
          </div>
        </SectionCard>
      </SheetBody>
    </>
  )
}
