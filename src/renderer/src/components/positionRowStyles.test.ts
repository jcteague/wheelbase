import { describe, expect, it } from 'vitest'
import { PHASE_COLOR } from '../lib/phase'
import { rowStyle } from './positionRowStyles'

describe('rowStyle', () => {
  it('leaves even rows transparent', () => {
    expect(rowStyle(0, 'CSP_OPEN')).toMatchObject({ '--wb-row-bg': 'transparent' })
  })

  it('tints odd rows with the translucent zebra background', () => {
    expect(rowStyle(1, 'CSP_OPEN')).toMatchObject({ '--wb-row-bg': 'rgba(255,255,255,0.01)' })
  })

  it.each(['CSP_OPEN', 'PMCC_OPEN'] as const)('carries the %s phase accent colour', (phase) => {
    expect(rowStyle(1, phase)).toMatchObject({ '--wb-row-phase-color': PHASE_COLOR[phase] })
  })
})
