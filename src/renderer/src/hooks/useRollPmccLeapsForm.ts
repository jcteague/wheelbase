// [US-105] The Roll LEAPS form instance: validated on every change so the preview and the
// rejections update as the trader types. Returns the schema it built so the form judges `valid`
// with the same instance rather than building a second one.
import { zodResolver } from '@hookform/resolvers/zod'
import { useMemo } from 'react'
import { useForm, type UseFormReturn } from 'react-hook-form'
import type { PmccLegTerms } from '../../../main/core/lifecycle'
import {
  EMPTY_ROLL_PMCC_LEAPS_DEFAULTS,
  rollPmccLeapsSchema,
  type RollPmccLeapsFormValues,
  type RollPmccLeapsSchema
} from '../schemas/roll-pmcc-leaps'

export type RollPmccLeapsFormInstance = {
  methods: UseFormReturn<RollPmccLeapsFormValues>
  schema: RollPmccLeapsSchema
}

/** The open LEAPS, the open short (`null` when none) and the position's last recorded event date. */
export type RollPmccLeapsFormContext = {
  leaps: PmccLegTerms
  openShort: PmccLegTerms | null
  lastEventDate: string
}

export function useRollPmccLeapsForm(
  { leaps, openShort, lastEventDate }: RollPmccLeapsFormContext,
  today: string
): RollPmccLeapsFormInstance {
  const shortStrike = openShort?.strike ?? null
  const shortExpiration = openShort?.expiration ?? null
  const schema = useMemo(
    () =>
      rollPmccLeapsSchema({
        currentLeaps: { strike: leaps.strike, expiration: leaps.expiration },
        openShort:
          shortStrike === null || shortExpiration === null
            ? null
            : { strike: shortStrike, expiration: shortExpiration },
        lastEventDate
      }),
    [leaps.strike, leaps.expiration, shortStrike, shortExpiration, lastEventDate]
  )
  const methods = useForm<RollPmccLeapsFormValues>({
    mode: 'onChange',
    resolver: zodResolver(schema),
    defaultValues: EMPTY_ROLL_PMCC_LEAPS_DEFAULTS(today, leaps.strike)
  })
  return { methods, schema }
}
