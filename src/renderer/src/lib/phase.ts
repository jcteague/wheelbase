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

export const PHASE_LABEL: Record<WheelPhase, string> = {
  CSP_OPEN: 'Sell Put',
  CSP_EXPIRED: 'Put Expired',
  CSP_CLOSED_PROFIT: 'Closed ✓',
  CSP_CLOSED_LOSS: 'Closed ✗',
  HOLDING_SHARES: 'Holding Shares',
  CC_OPEN: 'Sell Call',
  CC_EXPIRED: 'Call Expired',
  CC_CLOSED_PROFIT: 'Closed ✓',
  CC_CLOSED_LOSS: 'Closed ✗',
  WHEEL_COMPLETE: 'Wheel Complete'
}

export const ROLE_COLOR: Record<string, string> = {
  CSP_OPEN: '#e6a817',
  ASSIGN: '#79c0ff',
  CC_OPEN: '#d2a8ff',
  CC_CLOSE: '#3fb950',
  CC_EXPIRED: '#484f58',
  CALLED_AWAY: '#3fb950'
}

export const LEG_ROLE_LABEL: Record<string, string> = {
  CSP_OPEN: 'CSP Open',
  CSP_CLOSE: 'CSP Close',
  ASSIGN: 'Assign',
  CC_OPEN: 'CC Open',
  CC_CLOSE: 'CC Close',
  CC_EXPIRED: 'CC Expired',
  CALLED_AWAY: 'Called Away',
  EXPIRE: 'Expired',
  ROLL_FROM: 'Roll From',
  ROLL_TO: 'Roll'
}

export const PHASE_LABEL_SHORT: Record<WheelPhase, string> = {
  CSP_OPEN: 'CSP Open',
  CSP_EXPIRED: 'CSP Expired',
  CSP_CLOSED_PROFIT: 'CSP ✓',
  CSP_CLOSED_LOSS: 'CSP ✗',
  HOLDING_SHARES: 'Shares',
  CC_OPEN: 'CC Open',
  CC_EXPIRED: 'CC Expired',
  CC_CLOSED_PROFIT: 'CC ✓',
  CC_CLOSED_LOSS: 'CC ✗',
  WHEEL_COMPLETE: 'Complete'
}
