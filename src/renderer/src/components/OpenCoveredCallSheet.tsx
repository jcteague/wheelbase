import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ApiError, ApiFieldError, OpenCcResponse } from '../api/positions'
import { useOpenCoveredCall } from '../hooks/useOpenCoveredCall'
import { localToday } from '../lib/dates'
import { CcForm } from './OpenCcForm'
import { computeGuardrail } from './openCcGuardrail'
import { CcSuccess } from './OpenCcSuccess'
import { getSheetPortal } from '../lib/portal'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

export interface OpenCoveredCallSheetProps {
  open: boolean
  positionId: string
  ticker: string
  basisPerShare: string
  totalPremiumCollected: string
  contracts: number
  assignmentDate: string
  onClose: () => void
}

export function OpenCoveredCallSheet(props: OpenCoveredCallSheetProps): React.JSX.Element | null {
  const [strike, setStrike] = useState('')
  const [premium, setPremium] = useState('')
  const [ccContracts, setCcContracts] = useState(String(props.contracts))
  const [expiration, setExpiration] = useState('')
  const [fillDate, setFillDate] = useState(localToday())
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [successState, setSuccessState] = useState<OpenCcResponse | null>(null)

  const { mutate, isPending } = useOpenCoveredCall({ onSuccess: setSuccessState })

  if (!props.open) return null

  const sharesHeld = props.contracts * 100
  const guardrail = strike ? computeGuardrail(strike, props.basisPerShare) : null

  const handleSubmit = (): void => {
    const errors: Record<string, string> = {}
    if (!strike) errors.strike = 'Strike is required'
    if (!premium) errors.premium = 'Premium is required'
    if (!expiration) errors.expiration = 'Expiration is required'
    const contractsNum = parseInt(ccContracts, 10)
    if (!ccContracts || isNaN(contractsNum) || contractsNum <= 0) {
      errors.contracts = 'Contracts must be a positive integer'
    } else if (contractsNum > props.contracts) {
      errors.contracts = 'Contracts cannot exceed shares held'
    }
    if (fillDate && fillDate < props.assignmentDate) {
      errors.fillDate = 'Fill date cannot be before the assignment date'
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    mutate(
      {
        position_id: props.positionId,
        strike: parseFloat(strike),
        expiration,
        contracts: contractsNum,
        premium_per_contract: parseFloat(premium),
        fill_date: fillDate || undefined
      },
      {
        onError: (error) => {
          const apiErr = error as ApiError
          if (apiErr.status !== 400) return
          const body = apiErr.body as { detail?: ApiFieldError[] }
          const mapped: Record<string, string> = {}
          body.detail?.forEach((fe) => {
            mapped[fe.field] = fe.message
          })
          if (Object.keys(mapped).length > 0) setFieldErrors(mapped)
        }
      }
    )
  }

  const content = successState ? (
    <CcSuccess
      ticker={props.ticker}
      strike={successState.leg.strike}
      expiration={successState.leg.expiration}
      contracts={props.contracts}
      basisPerShare={successState.costBasisSnapshot.basisPerShare}
      totalPremiumCollected={successState.costBasisSnapshot.totalPremiumCollected}
      onClose={props.onClose}
    />
  ) : (
    <CcForm
      ticker={props.ticker}
      contracts={props.contracts}
      sharesHeld={sharesHeld}
      basisPerShare={props.basisPerShare}
      totalPremiumCollected={props.totalPremiumCollected}
      strike={strike}
      premium={premium}
      ccContracts={ccContracts}
      expiration={expiration}
      fillDate={fillDate}
      fieldErrors={fieldErrors}
      guardrail={guardrail}
      isPending={isPending}
      onStrikeChange={setStrike}
      onPremiumChange={setPremium}
      onContractsChange={setCcContracts}
      onExpirationChange={setExpiration}
      onFillDateChange={setFillDate}
      onSubmit={handleSubmit}
      onClose={props.onClose}
    />
  )

  return createPortal(
    <SheetOverlay onClose={props.onClose}>
      <SheetPanel>{content}</SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
