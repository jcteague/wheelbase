import type { WheelPhase } from '../api/positions'

/** A `wb-*` design-system colour token (`--wb-<token>` in index.css) a phase can be drawn in. */
export type PhaseToken = 'gold' | 'text-muted' | 'green' | 'red' | 'sky' | 'violet' | 'teal'

/**
 * The one phase → colour mapping. `PHASE_COLOR` resolves it to hex for inline tints; the position
 * card resolves it to a `border-l-wb-*` class.
 */
export const PHASE_TOKEN: Record<WheelPhase, PhaseToken> = {
  CSP_OPEN: 'gold',
  CSP_EXPIRED: 'text-muted',
  CSP_CLOSED_PROFIT: 'green',
  CSP_CLOSED_LOSS: 'red',
  HOLDING_SHARES: 'sky',
  CC_OPEN: 'violet',
  CC_EXPIRED: 'text-muted',
  CC_CLOSED_PROFIT: 'green',
  CC_CLOSED_LOSS: 'red',
  WHEEL_COMPLETE: 'green',
  PMCC_OPEN: 'teal'
}

/** Each token's `--wb-*` value; hex because `tintFromColor` appends an alpha to it. */
const TOKEN_HEX: Record<PhaseToken, string> = {
  gold: '#e6a817',
  'text-muted': '#484f58',
  green: '#3fb950',
  red: '#f85149',
  sky: '#79c0ff',
  violet: '#d2a8ff',
  teal: '#2dd4bf'
}

const phaseHex = (phase: WheelPhase): string => TOKEN_HEX[PHASE_TOKEN[phase]]

export const PHASE_COLOR: Record<WheelPhase, string> = {
  CSP_OPEN: phaseHex('CSP_OPEN'),
  CSP_EXPIRED: phaseHex('CSP_EXPIRED'),
  CSP_CLOSED_PROFIT: phaseHex('CSP_CLOSED_PROFIT'),
  CSP_CLOSED_LOSS: phaseHex('CSP_CLOSED_LOSS'),
  HOLDING_SHARES: phaseHex('HOLDING_SHARES'),
  CC_OPEN: phaseHex('CC_OPEN'),
  CC_EXPIRED: phaseHex('CC_EXPIRED'),
  CC_CLOSED_PROFIT: phaseHex('CC_CLOSED_PROFIT'),
  CC_CLOSED_LOSS: phaseHex('CC_CLOSED_LOSS'),
  WHEEL_COMPLETE: phaseHex('WHEEL_COMPLETE'),
  PMCC_OPEN: phaseHex('PMCC_OPEN')
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
  WHEEL_COMPLETE: 'Wheel Complete',
  PMCC_OPEN: 'LEAPS + short call open'
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
  ROLL_TO: 'Roll',
  LEAPS_OPEN: 'Buy LEAPS call',
  SHORT_CALL_OPEN: 'Sell short call'
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
  WHEEL_COMPLETE: 'Complete',
  PMCC_OPEN: 'LEAPS + short call open'
}
