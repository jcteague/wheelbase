import { describe, expect, expectTypeOf, it } from 'vitest'
import type { PmccPhase } from './core/types'
import { isKnownPmccPhase, toPmccListPhase, type PmccListPhase } from './pmcc-phase'

describe('isKnownPmccPhase', () => {
  it.each([
    ['PMCC_OPEN', true],
    ['PMCC_ASSIGNED', false],
    ['CC_OPEN', false]
  ])('%s → %s', (phase, known) => {
    expect(isKnownPmccPhase(phase)).toBe(known)
  })
})

describe('toPmccListPhase', () => {
  it('keeps a known phase as itself', () => {
    const phase = toPmccListPhase('PMCC_OPEN')
    expect(phase).toBe('PMCC_OPEN')
    expect(isKnownPmccPhase(phase)).toBe(true)
  })

  it('passes a phase this build does not know through as its raw label', () => {
    const phase = toPmccListPhase('PMCC_ASSIGNED')
    expect(phase).toBe('PMCC_ASSIGNED')
    expect(isKnownPmccPhase(phase)).toBe(false)
  })

  it('admits the known phases, and a bare string only through toPmccListPhase', () => {
    expectTypeOf<PmccPhase>().toExtend<PmccListPhase>()
    expectTypeOf<string>().not.toExtend<PmccListPhase>()
    expectTypeOf<'PMCC_ASSIGNED'>().not.toExtend<PmccListPhase>()
  })
})
