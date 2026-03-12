import { z } from 'zod'

export const StrategyType = z.enum(['WHEEL', 'PMCC'])
export const WheelStatus = z.enum(['ACTIVE', 'CLOSED'])
export const WheelPhase = z.enum(['CSP_OPEN', 'HOLDING_SHARES', 'CC_OPEN', 'WHEEL_COMPLETE'])
export const LegRole = z.enum([
  'CSP_OPEN',
  'CSP_CLOSE',
  'CC_OPEN',
  'CC_CLOSE',
  'ASSIGN',
  'ROLL_FROM',
  'ROLL_TO',
  'EXPIRE'
])
export const LegAction = z.enum(['SELL', 'BUY'])
export const OptionType = z.enum(['PUT', 'CALL'])

export type StrategyType = z.infer<typeof StrategyType>
export type WheelStatus = z.infer<typeof WheelStatus>
export type WheelPhase = z.infer<typeof WheelPhase>
export type LegRole = z.infer<typeof LegRole>
export type LegAction = z.infer<typeof LegAction>
export type OptionType = z.infer<typeof OptionType>
