// [US-115] The Sell Short Call sheet's pure helpers: the `After this sale` preview, the Coverage
// card's lines and the partial-coverage note. Figures are plans/us-115/data-model.md § 5: XYZ's
// LEAPS $85.00 · 2028-01-21, LEAPS cost 2250.0000, short credits 1400.0000, valued 2027-07-23.
import { describe, expect, it } from 'vitest'
import {
  LEAPS_ONLY_TIMELINE,
  XYZ_CYCLE_9_ASSIGNED,
  XYZ_TIMELINE
} from '../components/position-cockpit/PmccLegTimeline.fixture'
import {
  coverageCardLine,
  lastEndedCycle,
  previousCycleLine,
  sellPmccShortPreview,
  uncoveredContractsNote,
  type SellPmccShortDraft,
  type SellPmccShortPreviewInput
} from './pmcc-sell-short'

const TODAY = '2027-07-23'

const ONE_LEAPS = {
  ledger: { leapsCostTotal: '2250.0000', shortCreditsTotal: '1400.0000' },
  leaps: { strike: '85.0000', contracts: 1 }
}

/** The same per-share Background on 3 LEAPS contracts. */
const THREE_LEAPS = {
  ledger: { leapsCostTotal: '6750.0000', shortCreditsTotal: '4200.0000' },
  leaps: { strike: '85.0000', contracts: 3 }
}

const NEXT_SHORT: SellPmccShortDraft['short'] = {
  strike: '118.00',
  expiration: '2027-08-20',
  fillPrice: '1.95',
  fees: '0.00'
}

function previewInput({
  short = {},
  contracts = '1',
  position = ONE_LEAPS
}: {
  short?: Partial<SellPmccShortDraft['short']>
  contracts?: string
  position?: typeof ONE_LEAPS
} = {}): SellPmccShortPreviewInput {
  return { ...position, today: TODAY, draft: { contracts, short: { ...NEXT_SHORT, ...short } } }
}

describe('sellPmccShortPreview', () => {
  it('previews the next short: credit, DTE, and the ledger before and after the sale', () => {
    expect(sellPmccShortPreview(previewInput())).toEqual({
      creditTotal: '195.0000',
      dte: 28,
      from: expect.objectContaining({
        basisPerShare: '8.5000',
        effectiveShareCost: '93.5000',
        premiumRecoveredPercent: '62.2222'
      }),
      to: expect.objectContaining({
        basisPerShare: '6.5500',
        effectiveShareCost: '91.5500',
        premiumRecoveredPercent: '70.8889'
      }),
      strikeLine: { kind: 'margin', margin: '26.4500' },
      uncoveredContracts: 0
    })
  })

  it('reports the shortfall when the strike sits below the effective share cost after the sale', () => {
    expect(
      sellPmccShortPreview(previewInput({ short: { strike: '90.00', fillPrice: '1.50' } }))
    ).toEqual(
      expect.objectContaining({
        creditTotal: '150.0000',
        to: expect.objectContaining({
          basisPerShare: '7.0000',
          effectiveShareCost: '92.0000',
          premiumRecoveredPercent: '68.8889'
        }),
        strikeLine: { kind: 'shortfall', shortfall: '2.0000' }
      })
    )
  })

  it('a strike at the effective share cost after the sale is a zero margin, not a shortfall', () => {
    expect(sellPmccShortPreview(previewInput({ short: { strike: '91.55' } }))?.strikeLine).toEqual({
      kind: 'margin',
      margin: '0.0000'
    })
  })

  it('a strike one cent below the effective share cost after the sale is a shortfall', () => {
    expect(sellPmccShortPreview(previewInput({ short: { strike: '91.54' } }))?.strikeLine).toEqual({
      kind: 'shortfall',
      shortfall: '0.0100'
    })
  })

  it('a strike one cent above the effective share cost after the sale is a margin', () => {
    expect(sellPmccShortPreview(previewInput({ short: { strike: '91.56' } }))?.strikeLine).toEqual({
      kind: 'margin',
      margin: '0.0100'
    })
  })

  it('fees raise the basis but the credit stays gross', () => {
    expect(sellPmccShortPreview(previewInput({ short: { fees: '1.00' } }))).toEqual(
      expect.objectContaining({
        creditTotal: '195.0000',
        to: expect.objectContaining({
          basisPerShare: '6.5600',
          effectiveShareCost: '91.5600',
          premiumRecoveredPercent: '70.8444'
        }),
        strikeLine: { kind: 'margin', margin: '26.4400' }
      })
    )
  })

  it('a short on 1 of 3 LEAPS contracts spreads its credit over every LEAPS share', () => {
    const preview = sellPmccShortPreview(previewInput({ position: THREE_LEAPS }))
    expect(preview).toEqual(
      expect.objectContaining({
        creditTotal: '195.0000',
        to: expect.objectContaining({
          basisPerShare: '7.8500',
          effectiveShareCost: '92.8500',
          premiumRecoveredPercent: '65.1111'
        }),
        strikeLine: { kind: 'margin', margin: '25.1500' },
        uncoveredContracts: 2
      })
    )
  })

  it('scales the credit by the contracts sold', () => {
    const preview = sellPmccShortPreview(previewInput({ position: THREE_LEAPS, contracts: '3' }))
    expect(preview).toEqual(
      expect.objectContaining({
        creditTotal: '585.0000',
        to: expect.objectContaining({ basisPerShare: '6.5500' }),
        uncoveredContracts: 0
      })
    )
  })

  it.each([
    ['no strike', { short: { strike: '' } }],
    ['no sale price', { short: { fillPrice: '' } }],
    ['a zero sale price', { short: { fillPrice: '0' } }],
    ['a half-typed expiration', { short: { expiration: '2027-08' } }],
    ['no fees', { short: { fees: '' } }],
    ['no contracts', { contracts: '' }],
    ['fractional contracts', { contracts: '1.5' }],
    ['more contracts than the LEAPS holds', { contracts: '2' }]
  ])('is null for an incomplete draft: %s', (_label, draft) => {
    expect(sellPmccShortPreview(previewInput(draft))).toBeNull()
  })
})

describe('lastEndedCycle', () => {
  it('is the latest cycle that ended', () => {
    const cycle = lastEndedCycle({ cycles: XYZ_TIMELINE.cycles.slice(0, 8) })
    expect(cycle).toMatchObject({ number: 8, outcome: 'EXPIRED', endedOn: '2027-07-16' })
  })

  it('skips a cycle still open after it', () => {
    expect(lastEndedCycle(XYZ_TIMELINE)).toMatchObject({ number: 8 })
  })

  it('takes an assigned cycle as ended', () => {
    const cycles = [...XYZ_TIMELINE.cycles.slice(0, 8), XYZ_CYCLE_9_ASSIGNED]
    expect(lastEndedCycle({ cycles })).toMatchObject({ number: 9, outcome: 'ASSIGNED' })
  })

  it('is null when no short call was ever sold, or there is no timeline', () => {
    expect(lastEndedCycle(LEAPS_ONLY_TIMELINE)).toBeNull()
    expect(lastEndedCycle(null)).toBeNull()
  })
})

describe('previousCycleLine', () => {
  it.each([
    ['EXPIRED', 'Cycle 8 expired worthless 2027-07-16 · 7 days uncovered'],
    ['CLOSED', 'Cycle 8 closed early 2027-07-16 · 7 days uncovered'],
    ['ASSIGNED', 'Cycle 8 assigned 2027-07-16 · 7 days uncovered']
  ] as const)('names how the previous cycle ended: %s', (outcome, line) => {
    expect(previousCycleLine({ number: 8, outcome, endedOn: '2027-07-16' }, TODAY)).toBe(line)
  })

  it('counts a single uncovered day in the singular', () => {
    expect(previousCycleLine({ number: 8, outcome: 'EXPIRED', endedOn: '2027-07-22' }, TODAY)).toBe(
      'Cycle 8 expired worthless 2027-07-22 · 1 day uncovered'
    )
  })

  it('says so when no short call has been sold against the LEAPS', () => {
    expect(previousCycleLine(null, TODAY)).toBe(
      'No short call has been sold against this LEAPS yet'
    )
  })
})

describe('coverageCardLine', () => {
  const LEAPS = { strike: '85.0000', expiration: '2028-01-21' }

  it('reads the LEAPS strike, expiration, DTE and delta', () => {
    expect(coverageCardLine(LEAPS, 182, '0.8100')).toBe('$85.00 · 2028-01-21 · 182 DTE · Δ 0.81')
  })

  it('rounds the delta half up to 2 dp', () => {
    expect(coverageCardLine(LEAPS, 182, '0.8050')).toBe('$85.00 · 2028-01-21 · 182 DTE · Δ 0.81')
  })

  it('shows a dash with no delta', () => {
    expect(coverageCardLine(LEAPS, 182, null)).toBe('$85.00 · 2028-01-21 · 182 DTE · Δ —')
  })
})

describe('uncoveredContractsNote', () => {
  it('names the uncovered contracts and the one-open-short rule', () => {
    expect(uncoveredContractsNote(2)).toBe(
      '2 LEAPS contracts remain uncovered. Only one short call can be open at a time, so they stay uncovered until this one is retired.'
    )
  })

  it('reads in the singular for one contract', () => {
    expect(uncoveredContractsNote(1)).toBe(
      '1 LEAPS contract remains uncovered. Only one short call can be open at a time, so it stays uncovered until this one is retired.'
    )
  })
})
