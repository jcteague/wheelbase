import Decimal from 'decimal.js'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { RecordCallAwayResponse } from '../api/positions'
import { useRecordCallAway } from '../hooks/useRecordCallAway'
import { MONO } from '../lib/tokens'
import { CallAwayForm } from './CallAwayForm'
import { CallAwaySuccess } from './CallAwaySuccess'

const SIDEBAR_WIDTH = 200

export interface CallAwaySheetProps {
  open: boolean
  positionId: string
  ticker: string
  ccStrike: string
  ccExpiration: string
  contracts: number
  basisPerShare: string
  positionOpenedDate: string
  onClose: () => void
}

export function CallAwaySheet(props: CallAwaySheetProps): React.JSX.Element | null {
  const [successState, setSuccessState] = useState<RecordCallAwayResponse | null>(null)

  const { mutate, isPending } = useRecordCallAway({ onSuccess: setSuccessState })

  if (!props.open) return null

  const sharesHeld = props.contracts * 100
  const strike = new Decimal(props.ccStrike)
  const basis = new Decimal(props.basisPerShare)
  const appreciationPerShare = strike.minus(basis)
  const appreciationTotal = appreciationPerShare.times(sharesHeld)
  const finalPnl = appreciationTotal
  const capitalDeployed = basis.times(sharesHeld)

  const handleSubmit = (): void => {
    mutate({ position_id: props.positionId }, {})
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, left: SIDEBAR_WIDTH, zIndex: 50 }}>
      <div style={{ position: 'absolute', inset: 0 }} onClick={props.onClose} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          background: 'var(--wb-bg-surface)',
          borderLeft: '1px solid var(--wb-border)',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: MONO,
          color: 'var(--wb-text-primary)',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.5)'
        }}
      >
        {successState ? (
          <CallAwaySuccess
            ticker={props.ticker}
            ccStrike={props.ccStrike}
            ccExpiration={props.ccExpiration}
            sharesHeld={sharesHeld}
            finalPnl={successState.finalPnl}
            cycleDays={successState.cycleDays}
            annualizedReturn={successState.annualizedReturn}
            fillDate={successState.leg.fillDate}
            onClose={props.onClose}
          />
        ) : (
          <CallAwayForm
            ticker={props.ticker}
            ccStrike={props.ccStrike}
            ccExpiration={props.ccExpiration}
            contracts={props.contracts}
            sharesHeld={sharesHeld}
            basisPerShare={props.basisPerShare}
            appreciationPerShare={appreciationPerShare.toFixed(4)}
            appreciationTotal={appreciationTotal.toFixed(4)}
            finalPnl={finalPnl.toFixed(4)}
            capitalDeployed={capitalDeployed.toFixed(4)}
            isPending={isPending}
            onSubmit={handleSubmit}
            onClose={props.onClose}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
