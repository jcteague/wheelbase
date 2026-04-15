import Decimal from 'decimal.js'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { RecordCallAwayResponse } from '../api/positions'
import { useRecordCallAway } from '../hooks/useRecordCallAway'
import { CallAwayForm } from './CallAwayForm'
import { CallAwaySuccess } from './CallAwaySuccess'
import { getSheetPortal } from '../lib/portal'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

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
    <SheetOverlay onClose={props.onClose}>
      <SheetPanel>
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
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
