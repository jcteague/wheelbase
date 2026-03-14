import type { WheelPhase } from '../api/positions'

export const PHASE_COLOR: Record<WheelPhase, string> = {
  CSP_OPEN: '#e6a817',
  CSP_EXPIRED: '#484f58',
  CSP_CLOSED_PROFIT: '#3fb950',
  CSP_CLOSED_LOSS: '#f85149',
  HOLDING_SHARES: '#79c0ff',
  CC_OPEN: '#d2a8ff',
  CC_EXPIRED: '#484f58',
  CC_CLOSED_PROFIT: '#3fb950',
  CC_CLOSED_LOSS: '#f85149',
  WHEEL_COMPLETE: '#3fb950'
}
