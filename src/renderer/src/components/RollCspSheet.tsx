import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { createPortal } from 'react-dom'
import type { RollCspResponse } from '../api/positions'
import { useRollCsp } from '../hooks/useRollCsp'
import { RollCspForm } from './RollCspForm'
import { RollCspSuccess } from './RollCspSuccess'
import { SheetOverlay, SheetPanel } from './ui/Sheet'

function makeRollCspSchema(currentExpiration: string): z.ZodObject<{
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
      .refine((v) => v > currentExpiration, 'New expiration must be after the current expiration'),
    new_strike: z
      .string()
      .refine(
        (v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'Strike must be greater than zero'
      ),
    fill_date: z.string().optional()
  })
}

export type RollCspFormValues = {
  cost_to_close: string
  new_premium: string
  new_expiration: string
  new_strike: string
  fill_date?: string
}

export interface RollCspSheetProps {
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

export function RollCspSheet(props: RollCspSheetProps): React.JSX.Element | null {
  const [successState, setSuccessState] = useState<RollCspResponse | null>(null)
  const { mutate, isPending } = useRollCsp({ onSuccess: setSuccessState })

  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<RollCspFormValues>({
    resolver: zodResolver(makeRollCspSchema(props.expiration)),
    defaultValues: {
      new_strike: parseFloat(props.strike).toFixed(2),
      cost_to_close: '',
      new_premium: '',
      new_expiration: '',
      fill_date: ''
    }
  })

  const [costToClose, newPremium, newStrike] = useWatch({
    control,
    name: ['cost_to_close', 'new_premium', 'new_strike']
  })

  if (!props.open) return null

  function onSubmit(values: RollCspFormValues): void {
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
          <RollCspSuccess
            response={successState}
            ticker={props.ticker}
            prevBasisPerShare={props.basisPerShare}
            onClose={props.onClose}
          />
        ) : (
          <RollCspForm
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
            isPending={isPending}
            onSubmit={handleFormSubmit}
            onClose={props.onClose}
          />
        )}
      </SheetPanel>
    </SheetOverlay>,
    document.body
  )
}
