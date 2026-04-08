import type { RollCspResponse } from '../api/positions'
import { computeDte, fmtMoney } from '../lib/format'
import { getRollTypeLabel, rollCreditDebitColors } from '../lib/rolls'
import { MONO } from '../lib/tokens'
import { AlertBox } from './ui/AlertBox'
import { Caption } from './ui/Caption'
import { SectionCard } from './ui/SectionCard'

function SummaryRow({
  label,
  value,
  highlight
}: {
  label: string
  value: string
  highlight?: boolean
}): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.8rem',
        background: highlight
          ? 'linear-gradient(90deg, var(--wb-gold-subtle), transparent)'
          : undefined,
        padding: highlight ? '4px 0' : undefined
      }}
    >
      <span style={{ color: 'var(--wb-text-muted)' }}>{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  )
}

type RollCspSuccessProps = {
  response: RollCspResponse
  ticker: string
  prevBasisPerShare: string
  onClose: () => void
}

export function RollCspSuccess({
  response,
  ticker,
  prevBasisPerShare,
  onClose
}: RollCspSuccessProps): React.JSX.Element {
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
  const rollType = getRollTypeLabel(response.rollFromLeg.strike, response.rollToLeg.strike)
  const dte = computeDte(response.rollToLeg.expiration)

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${heroBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Caption>
            <span style={{ color: heroColor }}>Roll Complete</span>
          </Caption>
          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--wb-text-primary)' }}>
            CSP Rolled Successfully
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--wb-text-muted)' }}>
            {ticker} PUT {fmtMoney(response.rollFromLeg.strike)} → PUT{' '}
            {fmtMoney(response.rollToLeg.strike)} · {response.rollToLeg.expiration}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--wb-text-muted)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            lineHeight: 1
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          flex: 1
        }}
      >
        <div
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
              fontFamily: MONO
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
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SummaryRow label="Roll type" value={rollType} />
            <SummaryRow
              label="Old leg"
              value={`ROLL_FROM · BUY PUT ${fmtMoney(response.rollFromLeg.strike)} @ ${fmtMoney(response.rollFromLeg.premiumPerContract)}`}
            />
            <SummaryRow
              label="New leg"
              value={`ROLL_TO · SELL PUT ${fmtMoney(response.rollToLeg.strike)} @ ${fmtMoney(response.rollToLeg.premiumPerContract)}`}
            />
            <SummaryRow
              label="New expiration"
              value={`${response.rollToLeg.expiration} (${dte} DTE)`}
            />
            <SummaryRow label="Roll chain ID" value={response.rollChainId.slice(0, 8)} />
            <SummaryRow label="Phase" value="CSP_OPEN (unchanged)" />
            <SummaryRow
              label="Cost basis"
              value={`${fmtMoney(prevBasisPerShare)} → ${fmtMoney(newBasis)}/share`}
              highlight
            />
          </div>
        </SectionCard>

        <AlertBox variant="info">
          New CSP expires <strong>{response.rollToLeg.expiration}</strong> ({dte} DTE). Your cost
          basis {isCredit ? 'improved' : 'changed'} by ${Math.abs(net).toFixed(2)}/share from this
          roll.
        </AlertBox>
      </div>
    </div>
  )
}
