import { z } from 'zod'

const LEG_ACTION_VALUES = ['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'] as const

export const StrategyType = z.enum(['WHEEL', 'PMCC'])
export const WheelStatus = z.enum(['ACTIVE', 'CLOSED'])
export const WheelPhase = z.enum([
  'CSP_OPEN',
  'CSP_EXPIRED',
  'CSP_CLOSED_PROFIT',
  'CSP_CLOSED_LOSS',
  'HOLDING_SHARES',
  'CC_OPEN',
  'CC_EXPIRED',
  'CC_CLOSED_PROFIT',
  'CC_CLOSED_LOSS',
  'WHEEL_COMPLETE'
])
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
export const LegAction = z.enum(LEG_ACTION_VALUES)
export const InstrumentType = z.enum(['PUT', 'CALL', 'STOCK'])

export type StrategyType = z.infer<typeof StrategyType>
export type WheelStatus = z.infer<typeof WheelStatus>
export type WheelPhase = z.infer<typeof WheelPhase>
export type LegRole = z.infer<typeof LegRole>
export type LegAction = z.infer<typeof LegAction>
export type InstrumentType = z.infer<typeof InstrumentType>
