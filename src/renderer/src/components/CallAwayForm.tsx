import Decimal from 'decimal.js'
import { pnlColor } from '../lib/format'
import { MONO } from '../lib/tokens'
import { AlertBox } from './ui/AlertBox'
import { Caption } from './ui/Caption'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { PhaseBadge } from './PhaseBadge'

type CallAwayFormProps = {
  ticker: string
  ccStrike: string
  ccExpiration: string
  contracts: number
  sharesHeld: number
  basisPerShare: string
  appreciationPerShare: string
  appreciationTotal: string
  finalPnl: string
  capitalDeployed: string
  isPending: boolean
  onSubmit: () => void
  onClose: () => void
}

export function CallAwayForm({
  ticker,
  ccStrike,
  ccExpiration,
  contracts,
  sharesHeld,
  basisPerShare,
  appreciationPerShare,
  appreciationTotal,
  finalPnl,
  capitalDeployed,
  isPending,
  onSubmit,
  onClose
}: CallAwayFormProps): React.JSX.Element {
  const pnl = new Decimal(finalPnl)
  const pnlSign = pnl.gte(0) ? '+' : '−'
  const pnlValue = `${pnlSign}$${pnl.abs().toFixed(2)}`
  const finalPnlColor = pnlColor(finalPnl)
  const appPerShare = new Decimal(appreciationPerShare)

  return (
    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
      <div
        style={{
          padding: '20px 24px 18px',
          borderBottom: '1px solid var(--wb-border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexShrink: 0
        }}
      >
        <div>
          <Caption>Record Call-Away</Caption>
          <div
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--wb-text-primary)',
              marginBottom: 4
            }}
          >
            Shares Called Away
          </div>
          <div style={{ fontSize: 11, color: 'var(--wb-text-secondary)' }}>
            {ticker} CALL ${parseFloat(ccStrike).toFixed(2)} · {ccExpiration}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            background: 'var(--wb-bg-elevated)',
            border: '1px solid var(--wb-border)',
            color: 'var(--wb-text-muted)',
            fontSize: 14,
            width: 28,
            height: 28,
            borderRadius: 6,
            cursor: 'pointer',
            flexShrink: 0,
            marginLeft: 12,
            marginTop: 2
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
        <SectionCard>
          <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(30,42,56,0.6)',
                fontSize: 11
              }}
            >
              <span style={{ color: 'var(--wb-text-secondary)' }}>Position</span>
              <span>
                {ticker} CALL ${parseFloat(ccStrike).toFixed(2)} · {ccExpiration}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(30,42,56,0.6)',
                fontSize: 11
              }}
            >
              <span style={{ color: 'var(--wb-text-secondary)' }}>Contracts</span>
              <span>{contracts}</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(30,42,56,0.6)',
                fontSize: 11
              }}
            >
              <span style={{ color: 'var(--wb-text-secondary)' }}>Shares to deliver</span>
              <span style={{ color: 'var(--wb-text-primary)' }}>{sharesHeld} shares</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid rgba(30,42,56,0.6)',
                fontSize: 11
              }}
            >
              <span style={{ color: 'var(--wb-text-secondary)' }}>Phase transition</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <PhaseBadge phase="CC_OPEN" />
                <span style={{ fontSize: 9, color: 'var(--wb-text-muted)' }}>→</span>
                <PhaseBadge phase="WHEEL_COMPLETE" />
              </span>
            </div>

            {/* P&L Breakdown waterfall */}
            <div
              style={{
                padding: '10px 0',
                borderBottom: '1px solid rgba(30,42,56,0.6)',
                background: 'rgba(14,24,36,0.3)'
              }}
            >
              <Caption>P&amp;L Breakdown</Caption>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                  marginTop: 8
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--wb-text-secondary)' }}>
                  CC strike (shares delivered)
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--wb-text-primary)',
                    fontFamily: MONO
                  }}
                >
                  ${parseFloat(ccStrike).toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--wb-text-secondary)' }}>
                  − Effective cost basis
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--wb-red)',
                    fontFamily: MONO
                  }}
                >
                  ${parseFloat(basisPerShare).toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 2,
                  paddingLeft: 12
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--wb-text-muted)' }}>
                  = Appreciation per share
                </span>
                <span style={{ fontSize: 10, color: 'var(--wb-text-secondary)', fontFamily: MONO }}>
                  {appPerShare.gte(0) ? '' : '−'}${appPerShare.abs().toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                  paddingLeft: 12
                }}
              >
                <span style={{ fontSize: 10, color: 'var(--wb-text-muted)' }}>
                  × {sharesHeld} shares
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: pnlColor(appreciationTotal),
                    fontFamily: MONO
                  }}
                >
                  ${Math.abs(parseFloat(appreciationTotal)).toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTop: '1px solid rgba(30,42,56,0.8)'
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: finalPnlColor }}>
                  = Final cycle P&amp;L
                </span>
                <span
                  style={{ fontSize: 16, fontWeight: 700, color: finalPnlColor, fontFamily: MONO }}
                >
                  {pnlValue}
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 0',
                fontSize: 10
              }}
            >
              <span style={{ color: 'var(--wb-text-muted)' }}>
                effective cost basis · {sharesHeld} shares
              </span>
              <span>
                ${parseFloat(basisPerShare).toFixed(2)}/share · $
                {parseFloat(capitalDeployed).toFixed(2)} total
              </span>
            </div>
          </div>
        </SectionCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: 'var(--wb-text-muted)',
              fontFamily: MONO
            }}
          >
            Fill Date
          </label>
          <div
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid var(--wb-border)',
              background: 'rgba(14,24,36,0.6)',
              color: 'var(--wb-text-secondary)',
              fontSize: 14,
              fontFamily: MONO,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box'
            }}
          >
            <span>{ccExpiration}</span>
            <span
              style={{
                fontSize: 9,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--wb-text-muted)'
              }}
            >
              auto
            </span>
          </div>
          <span style={{ fontSize: '0.7rem', color: 'var(--wb-text-muted)' }}>
            Derived from your CC — the day shares are delivered to the buyer
          </span>
        </div>

        <AlertBox variant="warning">
          <strong>This cannot be undone.</strong> The position will close as WHEEL_COMPLETE. Full
          leg history is preserved.
        </AlertBox>
      </div>

      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--wb-border)',
          display: 'flex',
          gap: 10,
          flexShrink: 0
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '11px 24px',
            borderRadius: 6,
            border: '1px solid var(--wb-border)',
            background: 'transparent',
            color: 'var(--wb-text-secondary)',
            fontSize: '0.9375rem',
            fontWeight: 500,
            fontFamily: MONO,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <FormButton
          label="Confirm Call-Away"
          pendingLabel="Confirming…"
          isPending={isPending}
          onClick={onSubmit}
          data-testid="call-away-submit"
          style={{ flex: 1 }}
        />
      </div>
    </div>
  )
}
