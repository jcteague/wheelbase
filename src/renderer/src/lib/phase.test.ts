import { describe, expect, it } from 'vitest'
import type { WheelPhase } from '../api/positions'
import { PHASE_COLOR, PHASE_LABEL, PHASE_LABEL_SHORT } from './phase'

const ALL_PHASES = [
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
] as const satisfies readonly WheelPhase[]

describe('phase labels', () => {
  it('exposes the detail label for CSP_OPEN', () => {
    expect(PHASE_LABEL.CSP_OPEN).toBe('Sell Put')
  })

  it('exposes the short label for CSP_OPEN', () => {
    expect(PHASE_LABEL_SHORT.CSP_OPEN).toBe('CSP Open')
  })

  it('covers every WheelPhase value in PHASE_LABEL', () => {
    expect(Object.keys(PHASE_LABEL).sort()).toEqual([...ALL_PHASES].sort())
  })

  it('covers every WheelPhase value in PHASE_LABEL_SHORT', () => {
    expect(Object.keys(PHASE_LABEL_SHORT).sort()).toEqual([...ALL_PHASES].sort())
  })
})

describe('PHASE_COLOR', () => {
  it('still exports colors for every WheelPhase value', () => {
    expect(Object.keys(PHASE_COLOR).sort()).toEqual([...ALL_PHASES].sort())
  })
})
