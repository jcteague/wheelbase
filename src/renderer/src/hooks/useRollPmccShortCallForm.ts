// [US-104] The Roll Short Call form instance: validated on every change so the preview and the
// four rejections update as the trader types. Returns the schema it built so the form judges
// `valid` with the same instance rather than building a second one.
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import {
  EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS,
  rollPmccShortCallSchema,
  type RollPmccShortCallContext,
  type RollPmccShortCallFormValues,
  type RollPmccShortCallSchema
} from '../schemas/roll-pmcc-short-call'

export type RollPmccShortCallFormInstance = {
  methods: UseFormReturn<RollPmccShortCallFormValues>
  schema: RollPmccShortCallSchema
}

export function useRollPmccShortCallForm(
  { openShort: { strike, expiration, fillDate }, leapsExpiration }: RollPmccShortCallContext,
  today: string
): RollPmccShortCallFormInstance {
  const schema = useMemo(
    () => rollPmccShortCallSchema({ openShort: { strike, expiration, fillDate }, leapsExpiration }),
    [strike, expiration, fillDate, leapsExpiration]
  )
  const methods = useForm<RollPmccShortCallFormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: EMPTY_ROLL_PMCC_SHORT_CALL_DEFAULTS(today)
  })
  return { methods, schema }
}
