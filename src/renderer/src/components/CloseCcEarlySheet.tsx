import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { ApiError, ApiFieldError, CloseCcEarlyResponse } from '../api/positions'
import { useCloseCoveredCallEarly } from '../hooks/useCloseCoveredCallEarly'
import { CloseCcEarlyForm } from './CloseCcEarlyForm'
import { CloseCcEarlySuccess } from './CloseCcEarlySuccess'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

export interface CloseCcEarlySheetProps {
  open: boolean
  positionId: string
  ticker: string
  contracts: number
  openPremium: string
  ccOpenFillDate: string
  ccExpiration: string
  strike: string
  basisPerShare: string
  onClose: () => void
}

export function CloseCcEarlySheet(props: CloseCcEarlySheetProps): React.JSX.Element | null {
  const [closePrice, setClosePrice] = useState('')
  const [fillDate, setFillDate] = useState('')
  const [priceError, setPriceError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [successState, setSuccessState] = useState<CloseCcEarlyResponse | null>(null)

  const { mutate, isPending, isError, error } = useCloseCoveredCallEarly({
    onSuccess: setSuccessState
  })

  if (!props.open) return null

  const validate = (): boolean => {
    let valid = true
    const parsedPrice = Number.parseFloat(closePrice)
    const effectiveFillDate = fillDate || new Date().toISOString().slice(0, 10)

    if (!closePrice || Number.isNaN(parsedPrice) || parsedPrice <= 0) {
      setPriceError('Close price must be greater than zero')
      valid = false
    } else {
      setPriceError(null)
    }

    if (effectiveFillDate < props.ccOpenFillDate) {
      setDateError('Fill date cannot be before the CC open date')
      valid = false
    } else if (effectiveFillDate > props.ccExpiration) {
      setDateError('Fill date cannot be after the CC expiration date — use Record Expiry instead')
      valid = false
    } else {
      setDateError(null)
    }

    return valid
  }

  const handleSubmit = (): void => {
    if (!validate()) return

    mutate(
      {
        position_id: props.positionId,
        close_price_per_contract: Number.parseFloat(closePrice),
        fill_date: fillDate || new Date().toISOString().slice(0, 10)
      },
      {
        onError: (mutationError) => {
          const apiError = mutationError as ApiError
          if (apiError.status !== 400) return

          const fieldErrors: Record<string, string> = {}
          ;(apiError.body as { detail?: ApiFieldError[] }).detail?.forEach((fieldError) => {
            fieldErrors[fieldError.field] = fieldError.message
          })

          setPriceError(fieldErrors.close_price_per_contract ?? null)
          setDateError(fieldErrors.fill_date ?? null)
        }
      }
    )
  }

  return createPortal(
    <SheetOverlay onClose={props.onClose}>
      <SheetPanel>
        {successState ? (
          <CloseCcEarlySuccess
            ticker={props.ticker}
            strike={props.strike}
            basisPerShare={props.basisPerShare}
            ccLegPnl={successState.ccLegPnl}
            closePrice={successState.leg.fillPrice}
            fillDate={successState.leg.fillDate}
            openPremium={props.openPremium}
            onClose={props.onClose}
          />
        ) : (
          <CloseCcEarlyForm
            ticker={props.ticker}
            strike={props.strike}
            contracts={props.contracts}
            openPremium={props.openPremium}
            basisPerShare={props.basisPerShare}
            ccExpiration={props.ccExpiration}
            closePrice={closePrice}
            fillDate={fillDate}
            priceError={priceError}
            dateError={dateError}
            isPending={isPending}
            isError={isError}
            error={error}
            onClosePriceChange={(value) => {
              setClosePrice(value)
              setPriceError(null)
            }}
            onFillDateChange={(value) => {
              setFillDate(value)
              setDateError(null)
            }}
            onSubmit={handleSubmit}
            onClose={props.onClose}
          />
        )}
      </SheetPanel>
    </SheetOverlay>,
    document.body
  )
}
