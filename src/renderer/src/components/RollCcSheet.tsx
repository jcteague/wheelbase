import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { createPortal } from 'react-dom'
import type { RollCcResponse } from '../api/positions'
import { useRollCc } from '../hooks/useRollCc'
import type { RollCcFormValues } from './RollCcForm'
import { RollCcForm } from './RollCcForm'
import { RollCcSuccess } from './RollCcSuccess'
import { getSheetPortal } from '../lib/portal'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

function makeRollCcSchema(currentExpiration: string): z.ZodObject<{
  cost_to_close: z.ZodString
  new_premium: z.ZodString
  new_expiration: z.ZodString
  new_strike: z.ZodString
  fill_date: z.ZodOptional<z.ZodString>
}> {
  return z.object({
    cost_to_close: z
      .string()
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'Cost to close must be greater than zero'
      ),
    new_premium: z
      .string()
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'New premium must be greater than zero'
      ),
    new_expiration: z
      .string()
      .min(1, 'New expiration is required')
      .refine(
        (v) => v >= currentExpiration,
        'New expiration must be on or after the current expiration'
      ),
    new_strike: z
      .string()
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'Strike must be greater than zero'
      ),
    fill_date: z.string().optional()
  })
}

export interface RollCcSheetProps {
  open: boolean
  positionId: string
  ticker: string
  strike: string
  expiration: string
  contracts: number
  premiumPerContract: string
  basisPerShare: string
  totalPremiumCollected: string
  onClose: () => void
}

export function RollCcSheet(props: RollCcSheetProps): React.JSX.Element | null {
  const [successState, setSuccessState] = useState<RollCcResponse | null>(null)
  const [prevBasis, setPrevBasis] = useState<string>(props.basisPerShare)
  const { mutate, isPending } = useRollCc({ onSuccess: setSuccessState })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<RollCcFormValues>({
    resolver: zodResolver(makeRollCcSchema(props.expiration)),
    defaultValues: {
      new_strike: parseFloat(props.strike).toFixed(2),
      cost_to_close: '',
      new_premium: '',
      new_expiration: '',
      fill_date: ''
    }
  })

  const [costToClose, newPremium, newStrike, newExpiration] = useWatch({
    control,
    name: ['cost_to_close', 'new_premium', 'new_strike', 'new_expiration']
  })

  if (!props.open) return null

  function onSubmit(values: RollCcFormValues): void {
    setPrevBasis(props.basisPerShare)
    mutate({
      position_id: props.positionId,
      cost_to_close_per_contract: parseFloat(values.cost_to_close),
      new_premium_per_contract: parseFloat(values.new_premium),
      new_expiration: values.new_expiration,
      new_strike: parseFloat(values.new_strike),
      fill_date: values.fill_date || undefined
    })
  }

  function handleFormSubmit(): void {
    void handleSubmit(onSubmit)()
  }

  return createPortal(
    <SheetOverlay onClose={props.onClose}>
      <SheetPanel width={420}>
        {successState ? (
          <RollCcSuccess
            response={successState}
            ticker={props.ticker}
            prevBasisPerShare={prevBasis}
            onClose={props.onClose}
          />
        ) : (
          <RollCcForm
            ticker={props.ticker}
            strike={props.strike}
            expiration={props.expiration}
            contracts={props.contracts}
            premiumPerContract={props.premiumPerContract}
            basisPerShare={props.basisPerShare}
            register={register}
            errors={errors}
            control={control}
            costToClose={costToClose ?? ''}
            newPremium={newPremium ?? ''}
            newStrike={newStrike ?? ''}
            newExpiration={newExpiration ?? ''}
            isPending={isPending}
            onSubmit={handleFormSubmit}
            onClose={props.onClose}
          />
        )}
      </SheetPanel>
    </SheetOverlay>,
    getSheetPortal()
  )
}
