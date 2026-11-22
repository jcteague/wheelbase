// [US-115] The Sell Short Call form instance: validated on every change so the preview and the
// rejections update as the trader types. Returns the schema it built so the form judges `valid`
// with the same instance rather than building a second one.
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import {
  EMPTY_SELL_PMCC_SHORT_DEFAULTS,
  sellPmccShortSchema,
  type SellPmccShortFormContext,
  type SellPmccShortFormValues,
  type SellPmccShortSchema
} from '../schemas/sell-pmcc-short'

export type SellPmccShortFormInstance = {
  methods: UseFormReturn<SellPmccShortFormValues>
  schema: SellPmccShortSchema
}

export function useSellPmccShortForm({
  leaps: { strike, expiration, fillDate, contracts },
  previousShortRetiredOn,
  today
}: SellPmccShortFormContext): SellPmccShortFormInstance {
  const schema = useMemo(
    () =>
      sellPmccShortSchema({
        leaps: { strike, expiration, fillDate, contracts },
        previousShortRetiredOn,
        today
      }),
    [strike, expiration, fillDate, contracts, previousShortRetiredOn, today]
  )
  const methods = useForm<SellPmccShortFormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: EMPTY_SELL_PMCC_SHORT_DEFAULTS(today, contracts)
  })
  return { methods, schema }
}
