import { z } from 'zod'
import {
  MANAGEMENT_WINDOW_MAX,
  MANAGEMENT_WINDOW_MIN,
  MANAGEMENT_WINDOW_RANGE_MESSAGE,
  PROFIT_TARGET_MAX,
  PROFIT_TARGET_MIN,
  PROFIT_TARGET_RANGE_MESSAGE
} from '../../../main/core/alert-thresholds'

export const alertThresholdsSchema = z.object({
  profitTargetPercent: z.string().refine((v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= PROFIT_TARGET_MIN && n <= PROFIT_TARGET_MAX
  }, PROFIT_TARGET_RANGE_MESSAGE),
  managementWindowDte: z.string().refine((v) => {
    const n = Number(v)
    return Number.isInteger(n) && n >= MANAGEMENT_WINDOW_MIN && n <= MANAGEMENT_WINDOW_MAX
  }, MANAGEMENT_WINDOW_RANGE_MESSAGE)
})

export type AlertThresholdsFormValues = z.infer<typeof alertThresholdsSchema>
