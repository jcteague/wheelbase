import { describe, expect, it } from 'vitest'
import type { WheelPhase } from '../api/positions'
import { PHASE_COLOR, PHASE_LABEL, PHASE_LABEL_SHORT, ROLE_COLOR, LEG_ROLE_LABEL } from './phase'

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

describe('ROLE_COLOR', () => {
  it('contains all six role keys', () => {
    expect(Object.keys(ROLE_COLOR).sort()).toEqual([
      'ASSIGN',
      'CALLED_AWAY',
      'CC_CLOSE',
      'CC_EXPIRED',
      'CC_OPEN',
      'CSP_OPEN'
    ])
    // Each value should be a hex color string
    Object.values(ROLE_COLOR).forEach((color) => {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    })
  })
})

describe('LEG_ROLE_LABEL', () => {
  it('contains CALLED_AWAY entry', () => {
    expect(LEG_ROLE_LABEL['CALLED_AWAY']).toBe('Called Away')
  })

  it('contains CC_EXPIRED entry', () => {
    expect(LEG_ROLE_LABEL['CC_EXPIRED']).toBe('CC Expired')
  })

  it('contains CC_CLOSE entry with new label', () => {
    expect(LEG_ROLE_LABEL['CC_CLOSE']).toBe('CC Close')
  })
})
