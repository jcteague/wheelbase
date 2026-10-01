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
  'WHEEL_COMPLETE',
  'PMCC_OPEN'
] as const satisfies readonly WheelPhase[]

describe('phase labels', () => {
  it('exposes the detail label for CSP_OPEN', () => {
    expect(PHASE_LABEL.CSP_OPEN).toBe('Sell Put')
  })

  it('exposes the short label for CSP_OPEN', () => {
    expect(PHASE_LABEL_SHORT.CSP_OPEN).toBe('CSP Open')
  })

  it('labels PMCC_OPEN as LEAPS + short call open in both label maps', () => {
    expect(PHASE_LABEL.PMCC_OPEN).toBe('LEAPS + short call open')
    expect(PHASE_LABEL_SHORT.PMCC_OPEN).toBe('LEAPS + short call open')
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

  it('gives PMCC_OPEN a colour distinct from every wheel phase', () => {
    const wheelColors = ALL_PHASES.filter((p) => p !== 'PMCC_OPEN').map((p) => PHASE_COLOR[p])
    expect(PHASE_COLOR.PMCC_OPEN).toMatch(/^#[0-9a-f]{6}$/i)
    expect(wheelColors).not.toContain(PHASE_COLOR.PMCC_OPEN)
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

describe('LEG_ROLE_LABEL — PMCC roles', () => {
  it('labels LEAPS_OPEN as Buy LEAPS call', () => {
    expect(LEG_ROLE_LABEL['LEAPS_OPEN']).toBe('Buy LEAPS call')
  })

  it('labels SHORT_CALL_OPEN as Sell short call', () => {
    expect(LEG_ROLE_LABEL['SHORT_CALL_OPEN']).toBe('Sell short call')
  })
})
