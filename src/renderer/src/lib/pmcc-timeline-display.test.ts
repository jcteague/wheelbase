// [US-109] The PMCC leg timeline's section copy: the OPT-17 acceptance strings, formatted from
// literal `PmccTimeline` slices of the story's XYZ Background (plans/us-109/data-model.md § 5).
import { describe, expect, it } from 'vitest'
import type { PmccTimelineSummary } from '../../../main/core/pmcc-timeline'
import {
  basisFooter,
  closedBanner,
  coverageFlag,
  coverageStripLine,
  cycleHeader,
  cycleNetLabel,
  cyclesHeader,
  gapRow,
  leapsTrackHeader,
  reconciliationLine,
  rollMarker,
  signedPerShareAndTotal,
  summaryStats,
  timelineDrawerMeta
} from './pmcc-timeline-display'

const BACKGROUND_SUMMARY: PmccTimelineSummary = {
  cycleCount: 9,
  closedCount: 8,
  open: { count: 1, creditPerShare: '1.9500' },
  realizedPerShare: '14.0000',
  realizedTotal: '1400.0000',
  average: { perShare: '1.7500', total: '175.0000' },
  leapsRollNetPerShare: '2.5000',
  unattributedShortPerShare: null,
  totalDays: 333,
  uncoveredDays: 44,
  coveredDays: 289,
  shortCreditsPerShare: '15.9500',
  leapsCostPerShare: '22.5000',
  basisPerShare: '6.5500'
}

/** The $95 · 2028-06-16 LEAPS bought 2027-06-01 at $19.80 with no short call sold. */
const LEAPS_ONLY_SUMMARY: PmccTimelineSummary = {
  cycleCount: 0,
  closedCount: 0,
  open: null,
  realizedPerShare: '0.0000',
  realizedTotal: '0.0000',
  average: null,
  leapsRollNetPerShare: null,
  unattributedShortPerShare: null,
  totalDays: 73,
  uncoveredDays: 73,
  coveredDays: 0,
  shortCreditsPerShare: '0.0000',
  leapsCostPerShare: '19.8000',
  basisPerShare: '19.8000'
}

describe('timelineDrawerMeta', () => {
  it('summarises the Background as cycles and uncovered days', () => {
    expect(timelineDrawerMeta({ summary: { cycleCount: 9, uncoveredDays: 44 } })).toBe(
      '9 cycles · 44d uncovered'
    )
  })

  it('reads one cycle in the singular', () => {
    expect(timelineDrawerMeta({ summary: { cycleCount: 1, uncoveredDays: 0 } })).toBe(
      '1 cycle · 0d uncovered'
    )
  })

  it('reads no cycles in the plural', () => {
    expect(timelineDrawerMeta({ summary: { cycleCount: 0, uncoveredDays: 73 } })).toBe(
      '0 cycles · 73d uncovered'
    )
  })
})

describe('leapsTrackHeader', () => {
  const track = {
    current: { strike: '85.0000', expiration: '2028-01-21' },
    costPerShare: '22.5000'
  }

  it('reads the open LEAPS and its cost to date', () => {
    expect(leapsTrackHeader({ closedDate: null, leapsTrack: track })).toBe(
      'open $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share'
    )
  })

  it('reads closed once the position has closed', () => {
    expect(leapsTrackHeader({ closedDate: '2027-08-20', leapsTrack: track })).toBe(
      'closed $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share'
    )
  })
})

describe('cyclesHeader', () => {
  it('counts closed and open cycles', () => {
    expect(
      cyclesHeader({
        summary: { cycleCount: 9, closedCount: 8, open: { count: 1, creditPerShare: '1.9500' } }
      })
    ).toBe('9 cycles · 8 closed · 1 open')
  })

  it('omits the open count when none is open', () => {
    expect(cyclesHeader({ summary: { cycleCount: 9, closedCount: 9, open: null } })).toBe(
      '9 cycles · 9 closed'
    )
  })

  it('reads one cycle in the singular', () => {
    expect(
      cyclesHeader({
        summary: { cycleCount: 1, closedCount: 0, open: { count: 1, creditPerShare: '1.2000' } }
      })
    ).toBe('1 cycle · 0 closed · 1 open')
  })
})

describe('cycleHeader', () => {
  it('reads an ended cycle with its current strike and days held', () => {
    expect(
      cycleHeader({
        current: { strike: '112.0000', expiration: '2026-12-18' },
        openedOn: '2026-10-23',
        dteAtOpen: 28,
        status: 'ENDED',
        daysHeld: 56
      })
    ).toBe('$112.00 call · sold 2026-10-23 at 28 DTE · 56 days held')
  })

  it('reads an open cycle as days so far', () => {
    expect(
      cycleHeader({
        current: { strike: '118.0000', expiration: '2027-08-20' },
        openedOn: '2027-07-23',
        dteAtOpen: 28,
        status: 'OPEN',
        daysSoFar: 21
      })
    ).toBe('$118.00 call · sold 2027-07-23 at 28 DTE · 21 days so far')
  })

  it('reads a cycle past its expiration with no outcome recorded as days held to the expiration', () => {
    expect(
      cycleHeader({
        current: { strike: '118.0000', expiration: '2027-08-20' },
        openedOn: '2027-07-23',
        dteAtOpen: 28,
        status: 'UNRECORDED',
        daysHeld: 28
      })
    ).toBe('$118.00 call · sold 2027-07-23 at 28 DTE · 28 days held')
  })

  it('reads one day held in the singular', () => {
    expect(
      cycleHeader({
        current: { strike: '114.0000', expiration: '2027-04-16' },
        openedOn: '2027-04-01',
        dteAtOpen: 15,
        status: 'ENDED',
        daysHeld: 1
      })
    ).toBe('$114.00 call · sold 2027-04-01 at 15 DTE · 1 day held')
  })

  it('reads one day so far in the singular', () => {
    expect(
      cycleHeader({
        current: { strike: '118.0000', expiration: '2027-08-20' },
        openedOn: '2027-08-12',
        dteAtOpen: 8,
        status: 'OPEN',
        daysSoFar: 1
      })
    ).toBe('$118.00 call · sold 2027-08-12 at 8 DTE · 1 day so far')
  })
})

describe('signedPerShareAndTotal', () => {
  it.each([
    ['1.2000', '120.0000', '+$1.20 / share (+$120.00)'],
    ['14.0000', '1400.0000', '+$14.00 / share (+$1,400.00)'],
    ['-0.6000', '-60.0000', '−$0.60 / share (−$60.00)'],
    ['0.0000', '0.0000', '+$0.00 / share (+$0.00)']
  ])('%s / %s reads %s', (perShare, total, expected) => {
    expect(signedPerShareAndTotal(perShare, total)).toBe(expected)
  })

  it('rounds a third-decimal 5 half up on both figures', () => {
    expect(signedPerShareAndTotal('1.2350', '1235.0050')).toBe('+$1.24 / share (+$1,235.01)')
  })

  it('rounds a negative third-decimal 5 away from zero', () => {
    expect(signedPerShareAndTotal('-1.2350', '-123.5000')).toBe('−$1.24 / share (−$123.50)')
  })
})

describe('gapRow', () => {
  it('states an uncovered stretch with its length and dates', () => {
    expect(gapRow({ days: 7, from: '2026-10-16', to: '2026-10-23' })).toBe(
      'Uncovered · 7 days · 2026-10-16 to 2026-10-23'
    )
  })

  it('reads one day in the singular', () => {
    expect(gapRow({ days: 1, from: '2027-05-07', to: '2027-05-08' })).toBe(
      'Uncovered · 1 day · 2027-05-07 to 2027-05-08'
    )
  })
})

describe('coverageFlag', () => {
  it('states how long the short outlasts the open LEAPS', () => {
    expect(coverageFlag({ daysPastLeaps: 29, leapsExpiration: '2027-09-17' })).toBe(
      'This short expires 29 days after the open LEAPS (2027-09-17). It was uncovered for that stretch.'
    )
  })

  it('reads one day in the singular', () => {
    expect(coverageFlag({ daysPastLeaps: 1, leapsExpiration: '2027-09-17' })).toBe(
      'This short expires 1 day after the open LEAPS (2027-09-17). It was uncovered for that stretch.'
    )
  })
})

describe('summaryStats', () => {
  it('reads the six Background values with their tones', () => {
    expect(summaryStats({ summary: BACKGROUND_SUMMARY })).toEqual([
      { label: 'Cycles', value: '9 · 8 closed · 1 open', tone: 'default' },
      {
        label: 'Realized net credits',
        value: '+$14.00 / share (+$1,400.00)',
        tone: 'credit'
      },
      {
        label: 'Average per closed cycle',
        value: '+$1.75 / share (+$175.00)',
        tone: 'default'
      },
      { label: 'Open cycle credit', value: '+$1.95 / share · open', tone: 'open' },
      { label: 'LEAPS roll net', value: '+$2.50 / share · on the LEAPS track', tone: 'credit' },
      { label: 'Coverage', value: '289 of 333 days · 44 uncovered', tone: 'default' }
    ])
  })

  it('mutes the empty values when no short call has been sold', () => {
    expect(summaryStats({ summary: LEAPS_ONLY_SUMMARY })).toEqual([
      { label: 'Cycles', value: '0 · 0 closed', tone: 'default' },
      { label: 'Realized net credits', value: '+$0.00 / share (+$0.00)', tone: 'default' },
      { label: 'Average per closed cycle', value: '—', tone: 'muted' },
      { label: 'Open cycle credit', value: '—', tone: 'muted' },
      { label: 'LEAPS roll net', value: 'no roll yet', tone: 'muted' },
      { label: 'Coverage', value: '0 of 73 days · 73 uncovered', tone: 'default' }
    ])
  })

  it('reads all cycles closed once cycle 9 is assigned', () => {
    const [cycles, realized] = summaryStats({
      summary: {
        ...BACKGROUND_SUMMARY,
        closedCount: 9,
        open: null,
        realizedPerShare: '15.9500',
        realizedTotal: '1595.0000'
      }
    })
    expect([cycles.value, realized.value]).toEqual(['9 · 9 closed', '+$15.95 / share (+$1,595.00)'])
  })

  it.each([
    ['-0.0001', '-0.0100', '−$0.00 / share (−$0.01)', 'default'],
    ['0.0000', '0.0000', '+$0.00 / share (+$0.00)', 'default'],
    ['0.0001', '0.0100', '+$0.00 / share (+$0.01)', 'credit']
  ])(
    'reads realized net credits of %s / %s as %s in the %s tone',
    (perShare, total, value, tone) => {
      const realized = summaryStats({
        summary: { ...BACKGROUND_SUMMARY, realizedPerShare: perShare, realizedTotal: total }
      })[1]
      expect(realized).toEqual({ label: 'Realized net credits', value, tone })
    }
  )

  it.each([
    ['-0.6000', '−$0.60 / share · on the LEAPS track', 'default'],
    ['-0.0001', '−$0.00 / share · on the LEAPS track', 'default'],
    ['0.0000', '+$0.00 / share · on the LEAPS track', 'default'],
    ['0.0001', '+$0.00 / share · on the LEAPS track', 'credit']
  ])('reads a LEAPS roll net of %s as %s in the %s tone', (net, value, tone) => {
    const leapsRollNet = summaryStats({
      summary: { ...BACKGROUND_SUMMARY, leapsRollNetPerShare: net }
    })[4]
    expect(leapsRollNet).toEqual({ label: 'LEAPS roll net', value, tone })
  })
})

describe('reconciliationLine', () => {
  it('reconciles the Background to the US-103 basis', () => {
    expect(reconciliationLine({ summary: BACKGROUND_SUMMARY })).toEqual({
      lead: 'Realized $14.00 + open $1.95 = $15.95 short-call credits to date. LEAPS cost to date $22.50 − $15.95 = ',
      basis: '$6.55',
      tail: ' cost basis per share.'
    })
  })

  it('reconciles the fees variant', () => {
    const line = reconciliationLine({
      summary: {
        realizedPerShare: '13.9900',
        open: { count: 1, creditPerShare: '1.9500' },
        unattributedShortPerShare: null,
        shortCreditsPerShare: '15.9400',
        leapsCostPerShare: '22.5100',
        basisPerShare: '6.5700'
      }
    })
    expect(`${line.lead}${line.basis}${line.tail}`).toBe(
      'Realized $13.99 + open $1.95 = $15.94 short-call credits to date. LEAPS cost to date $22.51 − $15.94 = $6.57 cost basis per share.'
    )
  })

  it('reads the open credit as $0.00 when no cycle is open', () => {
    const line = reconciliationLine({
      summary: {
        realizedPerShare: '15.9500',
        open: null,
        unattributedShortPerShare: null,
        shortCreditsPerShare: '15.9500',
        leapsCostPerShare: '22.5000',
        basisPerShare: '6.5500'
      }
    })
    expect(line.lead).toBe(
      'Realized $15.95 + open $0.00 = $15.95 short-call credits to date. LEAPS cost to date $22.50 − $15.95 = '
    )
  })

  it('adds a short roll no cycle holds as unattributed, so the credits still add up', () => {
    const line = reconciliationLine({
      summary: {
        realizedPerShare: '0.0000',
        open: null,
        unattributedShortPerShare: '1.0000',
        shortCreditsPerShare: '1.0000',
        leapsCostPerShare: '19.8000',
        basisPerShare: '18.8000'
      }
    })
    expect(`${line.lead}${line.basis}${line.tail}`).toBe(
      'Realized $0.00 + open $0.00 + unattributed $1.00 = $1.00 short-call credits to date. LEAPS cost to date $19.80 − $1.00 = $18.80 cost basis per share.'
    )
  })

  it('reads a negative unattributed figure with the U+2212 minus, like the rest of the section', () => {
    const line = reconciliationLine({
      summary: {
        realizedPerShare: '1.4000',
        open: { count: 1, creditPerShare: '0.5000' },
        unattributedShortPerShare: '-0.6100',
        shortCreditsPerShare: '1.2900',
        leapsCostPerShare: '19.8000',
        basisPerShare: '18.5100'
      }
    })
    expect(line.lead).toBe(
      'Realized $1.40 + open $0.50 + unattributed −$0.61 = $1.29 short-call credits to date. LEAPS cost to date $19.80 − $1.29 = '
    )
  })

  it('reads a basis driven below zero with the U+2212 minus', () => {
    // Credits past the LEAPS cost: $19.80 − $20.25 = −$0.45.
    const line = reconciliationLine({
      summary: {
        realizedPerShare: '18.2500',
        open: { count: 1, creditPerShare: '2.0000' },
        unattributedShortPerShare: null,
        shortCreditsPerShare: '20.2500',
        leapsCostPerShare: '19.8000',
        basisPerShare: '-0.4500'
      }
    })
    expect(line).toEqual({
      lead: 'Realized $18.25 + open $2.00 = $20.25 short-call credits to date. LEAPS cost to date $19.80 − $20.25 = ',
      basis: '−$0.45',
      tail: ' cost basis per share.'
    })
  })
})

describe('coverageStripLine', () => {
  it('reads covered and uncovered days', () => {
    expect(coverageStripLine({ summary: BACKGROUND_SUMMARY })).toBe(
      'covered 289 of 333 days · 44 uncovered'
    )
  })
})

describe('closedBanner', () => {
  it('names the close date', () => {
    expect(closedBanner({ closedDate: '2027-08-20' })).toBe(
      'Position closed 2027-08-20 · the timeline is complete'
    )
  })

  it('is absent while the position is open', () => {
    expect(closedBanner({ closedDate: null })).toBeNull()
  })
})

describe('rollMarker', () => {
  it.each([
    [0, null],
    [1, '1 roll'],
    [2, '2 rolls']
  ])('%i rolls reads %s', (count, expected) => {
    expect(rollMarker(count)).toBe(expected)
  })
})

describe('cycleNetLabel', () => {
  it('labels an open cycle as open, never realized', () => {
    expect(cycleNetLabel({ status: 'OPEN' })).toBe('Net credit, open')
  })

  it('keeps a cycle with no recorded outcome labelled open: its credit is not realized', () => {
    expect(cycleNetLabel({ status: 'UNRECORDED' })).toBe('Net credit, open')
  })

  it('labels an ended cycle as its net credit', () => {
    expect(cycleNetLabel({ status: 'ENDED' })).toBe('Net credit')
  })
})

describe('basisFooter', () => {
  it('captions the basis after the cycle, per share', () => {
    expect(basisFooter({ number: 2, basisAfter: '21.8000' })).toEqual({
      label: 'PMCC cost basis after cycle 2',
      value: '$21.80 / share'
    })
  })
})
