// [US-109] PMCC leg timeline engine: event order, the LEAPS track, short-call cycles and the
// basis replayed through the US-103 ledger. Expected values are the story's Background literals
// (plans/us-109/data-model.md § 5).
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import {
  buildPmccTimeline,
  type PmccCycle,
  type PmccCycleRow,
  type PmccCycleStatus,
  type PmccGap,
  type PmccTimeline,
  type PmccTimelineEvent,
  type PmccTimelineInput,
  type PmccTimelineSummary
} from './pmcc-timeline'
import {
  cycle9ExpiredEvent,
  endedCycleInput,
  leapsCloseEvent,
  leapsOnlyInput,
  lossCycleInput,
  outlastingShortInput,
  overlappingCyclesInput,
  secondLeapsRollEvent,
  shortExpiredEvent,
  shortOpenEvent,
  shortRollInput,
  shortSaleEvent,
  strayShortCloseEvent,
  strayShortRollEvent,
  unknownEvent,
  withEventDate,
  withEvents,
  xyzBackground
} from './test-fixtures/pmcc-timeline-events'

/** The timeline of a history that has a LEAPS. */
function timelineOf(input: PmccTimelineInput): PmccTimeline {
  const timeline = buildPmccTimeline(input)
  if (timeline === null) throw new Error('expected a timeline: the history has no LEAPS')
  return timeline
}

const cycleOf = (timeline: PmccTimeline, number: number): PmccCycle => timeline.cycles[number - 1]

const footers = (timeline: PmccTimeline): string[] => timeline.cycles.map((c) => c.basisAfter)

const BACKGROUND_FOOTERS = [
  '23.0000',
  '21.8000',
  '20.1000',
  '18.5500',
  '16.9000',
  '15.1500',
  '13.4000',
  '8.5000',
  '6.5500'
]

const reversed = (input: PmccTimelineInput): PmccTimelineInput => ({
  ...input,
  events: [...input.events].reverse()
})

describe('buildPmccTimeline — the XYZ Background', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(xyzBackground())
  })

  it('carries the window and the dates it was given, and no LEAPS contract count', () => {
    expect(timeline).not.toHaveProperty('leapsContracts')
    expect(timeline).toMatchObject({
      start: '2026-09-14',
      windowEnd: '2027-08-13',
      valuationDate: '2027-08-13',
      closedDate: null
    })
  })

  it('makes one cycle per short call sold, numbered from 1 — the roll starts none', () => {
    expect(timeline.cycles.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it("keeps cycle 2's roll inside the cycle as roll #1 between its open and its end", () => {
    const cycle2 = cycleOf(timeline, 2)
    expect(cycle2.rollCount).toBe(1)
    expect(cycle2.rows.map((row) => row.kind)).toEqual(['OPEN', 'ROLL', 'END'])
    expect(cycle2.rows[1]).toEqual({
      kind: 'ROLL',
      number: 1,
      date: '2026-11-06',
      from: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '3.0000' },
      to: { strike: '112.0000', expiration: '2026-12-18', pricePerShare: '2.4000' },
      net: { direction: 'debit', perShare: '0.6000', total: '60.0000' },
      fees: '0.0000'
    })
  })

  it.each([
    [1, '2.0000', '200.0000'],
    [2, '1.2000', '120.0000'],
    [5, '1.6500', '165.0000'],
    [9, '1.9500', '195.0000']
  ])('nets cycle %i at %s / share (%s)', (number, perShare, total) => {
    expect(cycleOf(timeline, number)).toMatchObject({ netPerShare: perShare, netTotal: total })
  })

  it("opens cycle 1 with a sell-to-open row of the fill's gross total", () => {
    expect(cycleOf(timeline, 1).rows[0]).toEqual({
      kind: 'OPEN',
      date: '2026-09-14',
      contract: { strike: '110.0000', expiration: '2026-10-16', pricePerShare: '2.0000' },
      total: '200.0000',
      fees: '0.0000'
    })
  })

  it('states cycle 1 as sold at 32 DTE, expired after 32 days', () => {
    expect(cycleOf(timeline, 1)).toMatchObject({
      openedOn: '2026-09-14',
      opening: { strike: '110.0000', expiration: '2026-10-16', pricePerShare: '2.0000' },
      current: { strike: '110.0000', expiration: '2026-10-16' },
      dteAtOpen: 32,
      status: 'ENDED',
      outcome: 'EXPIRED',
      endedOn: '2026-10-16',
      daysHeld: 32
    })
  })

  it("states cycle 2 at its opening's 28 DTE, held 56 days, now on the rolled-to contract", () => {
    expect(cycleOf(timeline, 2)).toMatchObject({
      openedOn: '2026-10-23',
      opening: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '1.8000' },
      current: { strike: '112.0000', expiration: '2026-12-18' },
      dteAtOpen: 28,
      outcome: 'EXPIRED',
      endedOn: '2026-12-18',
      daysHeld: 56
    })
  })

  it('states cycle 5 as closed early after 18 days, with the buyback on its end row', () => {
    const cycle5 = cycleOf(timeline, 5)
    expect(cycle5).toMatchObject({ status: 'ENDED', outcome: 'CLOSED', daysHeld: 18 })
    expect(cycle5.rows.at(-1)).toEqual({
      kind: 'END',
      date: '2027-04-02',
      outcome: 'CLOSED',
      contract: { strike: '114.0000', expiration: '2027-04-16' },
      pricePerShare: '0.5500',
      total: '55.0000',
      fees: '0.0000'
    })
  })

  it('states cycle 9 as open: 21 days so far, 7 DTE remaining, no outcome', () => {
    const cycle9 = cycleOf(timeline, 9)
    expect(cycle9).toMatchObject({ status: 'OPEN', daysSoFar: 21, dteRemaining: 7 })
    expect(cycle9).not.toHaveProperty('outcome')
    expect(cycle9.rows.map((row) => row.kind)).toEqual(['OPEN'])
  })

  it('replays the US-103 ledger for the basis after each cycle', () => {
    expect(footers(timeline)).toEqual(BACKGROUND_FOOTERS)
  })

  it('lists the LEAPS purchase and its one roll on the LEAPS track', () => {
    expect(timeline.leapsTrack.rows).toEqual([
      {
        kind: 'PURCHASE',
        date: '2026-09-14',
        contract: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '25.0000' },
        total: '2500.0000',
        dteAtFill: 368,
        basisAfter: '25.0000',
        fees: '0.0000'
      },
      {
        kind: 'ROLL',
        number: 1,
        date: '2027-07-09',
        from: { strike: '80.0000', expiration: '2027-09-17', pricePerShare: '26.0000' },
        to: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '23.5000' },
        net: { direction: 'credit', perShare: '2.5000', total: '250.0000' },
        coverage: { unbroken: true, extensionDays: 126 },
        basisAfter: '8.5000',
        fees: '0.0000'
      }
    ])
  })

  it('names the LEAPS held now and its cost to date', () => {
    expect(timeline.leapsTrack.current).toEqual({ strike: '85.0000', expiration: '2028-01-21' })
    expect(timeline.leapsTrack.costPerShare).toBe('22.5000')
  })
})

describe('buildPmccTimeline — a second LEAPS roll', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(withEvents(xyzBackground(), secondLeapsRollEvent(20)))
  })

  it('numbers the LEAPS rolls in order', () => {
    expect(
      timeline.leapsTrack.rows.flatMap((row) => (row.kind === 'ROLL' ? [row.number] : []))
    ).toEqual([1, 2])
  })

  it('names the replacement from the last roll as the LEAPS held now', () => {
    expect(timeline.leapsTrack.current).toEqual({ strike: '90.0000', expiration: '2028-06-16' })
    expect(timeline.leapsTrack.costPerShare).toBe('20.5000')
  })
})

describe('buildPmccTimeline — event order', () => {
  it.each([
    ['as recorded', (input: PmccTimelineInput) => input],
    ['reversed', reversed]
  ])('ends cycle 6 before cycle 7 opens on 2027-05-07 with the events %s', (_order, arrange) => {
    const timeline = timelineOf(arrange(xyzBackground()))
    expect(cycleOf(timeline, 6).basisAfter).toBe('15.1500')
    expect(cycleOf(timeline, 7).basisAfter).toBe('13.4000')
  })

  it('gives the same footers whatever the order of the events array', () => {
    expect(footers(timelineOf(reversed(xyzBackground())))).toEqual(BACKGROUND_FOOTERS)
  })

  it('puts the LEAPS purchase first on its day even when the short was recorded before it', () => {
    const base = xyzBackground()
    const shortFirst = (event: PmccTimelineEvent): PmccTimelineEvent => {
      if (event.seq === 0) return { ...event, seq: 1 }
      if (event.seq === 1) return { ...event, seq: 0 }
      return event
    }
    const timeline = timelineOf({ ...base, events: base.events.map(shortFirst) })
    expect(timeline.leapsTrack.rows[0]).toMatchObject({ kind: 'PURCHASE', basisAfter: '25.0000' })
    expect(cycleOf(timeline, 1).basisAfter).toBe('23.0000')
  })

  it('orders two same-day events of one kind by seq, not array order', () => {
    const input = withEvents(
      xyzBackground(),
      unknownEvent(22, '2027-08-04', 'SECOND'),
      unknownEvent(21, '2027-08-04', 'FIRST')
    )
    const roles = cycleOf(timelineOf(input), 9).rows.flatMap((row) =>
      row.kind === 'UNKNOWN' ? [row.role] : []
    )
    expect(roles).toEqual(['FIRST', 'SECOND'])
  })
})

/** The input with the events recorded at `a` and `b` trading `seq`. */
const withSeqsSwapped = (input: PmccTimelineInput, a: number, b: number): PmccTimelineInput => ({
  ...input,
  events: input.events.map((event) => {
    if (event.seq === a) return { ...event, seq: b }
    if (event.seq === b) return { ...event, seq: a }
    return event
  })
})

/** The four ways two same-day events can arrive: array order × which was recorded first. */
const arrangements = (
  a: number,
  b: number
): [string, (i: PmccTimelineInput) => PmccTimelineInput][] => [
  ['as recorded', (input) => input],
  ['reversed', reversed],
  ['with their seqs swapped', (input) => withSeqsSwapped(input, a, b)],
  ['reversed, with their seqs swapped', (input) => reversed(withSeqsSwapped(input, a, b))]
]

const rowKinds = (cycle: PmccCycle): string[] => cycle.rows.map((row) => row.kind)

/** $108 · 2026-11-20 sold 2026-10-23 at 1.80 (seq 1), rolled to the $112 the same day. */
const soldAndRolledSameDay = (): PmccTimelineInput =>
  withEventDate(
    shortRollInput({ buyBack: '3.0000', sellNew: '2.4000', cashPerShare: '0.6000' }),
    2,
    '2026-10-23'
  )

/** A short call bought to close at `price`: no fees. */
const shortEnd = (
  seq: number,
  date: string,
  strike: string,
  expiration: string,
  price: string
): PmccTimelineEvent => ({
  kind: 'SHORT_END',
  seq,
  date,
  contracts: 1,
  outcome: 'CLOSED',
  contract: { strike, expiration },
  pricePerShare: price,
  contribution: { side: 'SHORT', cashPerShare: price, contracts: 1, fees: '0.0000' }
})

describe('buildPmccTimeline — same-day events of one short call', () => {
  it.each(arrangements(1, 2))(
    'keeps a short sold and rolled the same day in one cycle, open then roll (%s)',
    (_order, arrange) => {
      const timeline = timelineOf(arrange(soldAndRolledSameDay()))
      expect(timeline.cycles).toHaveLength(1)
      expect(rowKinds(cycleOf(timeline, 1))).toEqual(['OPEN', 'ROLL'])
      // 1.80 credit − 0.60 roll debit.
      expect(cycleOf(timeline, 1)).toMatchObject({
        status: 'OPEN',
        rollCount: 1,
        current: { strike: '112.0000', expiration: '2026-12-18' },
        netPerShare: '1.2000',
        netTotal: '120.0000'
      })
      expect(timeline.summary).toMatchObject({
        open: { count: 1, creditPerShare: '1.2000' },
        realizedPerShare: '0.0000',
        shortCreditsPerShare: '1.2000'
      })
    }
  )

  it.each(arrangements(1, 2))(
    'ends a short sold and bought back the same day in its own cycle, held 0 days (%s)',
    (_order, arrange) => {
      const timeline = timelineOf(arrange(withEventDate(lossCycleInput(), 2, '2026-10-23')))
      expect(timeline.cycles).toHaveLength(1)
      expect(rowKinds(cycleOf(timeline, 1))).toEqual(['OPEN', 'END'])
      expect(cycleOf(timeline, 1)).toMatchObject({
        status: 'ENDED',
        outcome: 'CLOSED',
        openedOn: '2026-10-23',
        endedOn: '2026-10-23',
        daysHeld: 0,
        netPerShare: '-0.5000'
      })
      expect(timeline.summary).toMatchObject({
        realizedPerShare: '-0.5000',
        open: null,
        shortCreditsPerShare: '-0.5000'
      })
    }
  )

  it.each(arrangements(2, 3))(
    'chains a short sold and rolled twice on one day in roll order (%s)',
    (_order, arrange) => {
      const secondRoll: PmccTimelineEvent = {
        // Buy the $112 back at 2.50, sell the $115 · 2027-01-15 at 2.90: a 0.40 credit.
        kind: 'SHORT_ROLL',
        seq: 3,
        date: '2026-10-23',
        contracts: 1,
        from: { strike: '112.0000', expiration: '2026-12-18', pricePerShare: '2.5000' },
        to: { strike: '115.0000', expiration: '2027-01-15', pricePerShare: '2.9000' },
        contribution: { side: 'SHORT', cashPerShare: '-0.4000', contracts: 1, fees: '0.0000' }
      }
      const timeline = timelineOf(arrange(withEvents(soldAndRolledSameDay(), secondRoll)))
      const cycle = cycleOf(timeline, 1)
      expect(timeline.cycles).toHaveLength(1)
      expect(cycle.rows.map((row) => (row.kind === 'ROLL' ? row.from.strike : row.kind))).toEqual([
        'OPEN',
        '108.0000',
        '112.0000'
      ])
      // 1.80 − 0.60 + 0.40.
      expect(cycle).toMatchObject({
        rollCount: 2,
        current: { strike: '115.0000', expiration: '2027-01-15' },
        netPerShare: '1.6000'
      })
    }
  )

  it.each(arrangements(2, 3))(
    'ends the rolled-to contract after the roll that put it in hand, the same day (%s)',
    (_order, arrange) => {
      const input = withEvents(
        shortRollInput({ buyBack: '3.0000', sellNew: '2.4000', cashPerShare: '0.6000' }),
        shortEnd(3, '2026-11-06', '112.0000', '2026-12-18', '2.0000')
      )
      const cycle = cycleOf(timelineOf(arrange(input)), 1)
      expect(rowKinds(cycle)).toEqual(['OPEN', 'ROLL', 'END'])
      // 1.80 − 0.60 − 2.00.
      expect(cycle).toMatchObject({
        status: 'ENDED',
        rollCount: 1,
        endedOn: '2026-11-06',
        daysHeld: 14,
        netPerShare: '-0.8000'
      })
    }
  )

  it.each(arrangements(2, 3))(
    'ends the held short before the same contract is sold again that day (%s)',
    (_order, arrange) => {
      const resold: PmccTimelineEvent = {
        kind: 'SHORT_OPEN',
        seq: 3,
        date: '2026-11-06',
        contracts: 1,
        contract: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '1.5000' },
        contribution: { side: 'SHORT', cashPerShare: '-1.5000', contracts: 1, fees: '0.0000' }
      }
      const timeline = timelineOf(arrange(withEvents(lossCycleInput(), resold)))
      expect(timeline.cycles.map(rowKinds)).toEqual([['OPEN', 'END'], ['OPEN']])
      expect(cycleOf(timeline, 1)).toMatchObject({ status: 'ENDED', endedOn: '2026-11-06' })
      expect(cycleOf(timeline, 2)).toMatchObject({ status: 'OPEN', netPerShare: '1.5000' })
    }
  )

  it.each(arrangements(2, 3))(
    'keeps the rank of an end no cycle holds: it files under the cycle open before a same-day sale (%s)',
    (_order, arrange) => {
      const sale: PmccTimelineEvent = {
        kind: 'SHORT_OPEN',
        seq: 2,
        date: '2027-08-01',
        contracts: 1,
        contract: { strike: '125.0000', expiration: '2027-09-17', pricePerShare: '1.1000' },
        contribution: { side: 'SHORT', cashPerShare: '-1.1000', contracts: 1, fees: '0.0000' }
      }
      const stray = shortEnd(3, '2027-08-01', '999.0000', '2027-08-01', '0.2000')
      const timeline = timelineOf(
        arrange(withEvents(outlastingShortInput('2027-10-16'), sale, stray))
      )
      expect(timeline.cycles.map(rowKinds)).toEqual([['OPEN', 'END'], ['OPEN']])
      expect(cycleOf(timeline, 1)).toMatchObject({ status: 'ENDED', endedOn: '2027-08-01' })
      expect(cycleOf(timeline, 2)).toMatchObject({ status: 'OPEN', netPerShare: '1.1000' })
    }
  )

  it.each([
    ['as recorded', (input: PmccTimelineInput) => input],
    ['reversed', reversed]
  ])(
    'falls back to rank then seq for a same-day loop of rolls neither of whose contracts is held (%s)',
    (_order, arrange) => {
      const roll = (seq: number, from: string, to: string): PmccTimelineEvent => ({
        kind: 'SHORT_ROLL',
        seq,
        date: '2026-10-30',
        contracts: 1,
        from: { strike: from, expiration: '2026-11-27', pricePerShare: '1.0000' },
        to: { strike: to, expiration: '2026-11-27', pricePerShare: '1.0000' },
        contribution: { side: 'SHORT', cashPerShare: '0.0000', contracts: 1, fees: '0.0000' }
      })
      // The $108's 2026-11-06 buyback is ready (its contract is held) while the loop is not;
      // it must still wait for its own day.
      const input = withEvents(
        lossCycleInput(),
        roll(3, '110.0000', '112.0000'),
        roll(4, '112.0000', '110.0000')
      )
      const cycle = cycleOf(timelineOf(arrange(input)), 1)
      expect(cycle.rows.map((row) => (row.kind === 'ROLL' ? row.from.strike : row.kind))).toEqual([
        'OPEN',
        '110.0000',
        '112.0000',
        'END'
      ])
    }
  )
})

describe('buildPmccTimeline — roll nets', () => {
  it('reads a roll that took in more than it paid as a credit', () => {
    const timeline = timelineOf(
      shortRollInput({ buyBack: '1.1000', sellNew: '2.3000', cashPerShare: '-1.2000' })
    )
    expect(cycleOf(timeline, 1).rows[1]).toMatchObject({
      kind: 'ROLL',
      net: { direction: 'credit', perShare: '1.2000', total: '120.0000' }
    })
  })

  it('reads a roll at equal prices as even', () => {
    const timeline = timelineOf(
      shortRollInput({ buyBack: '2.0000', sellNew: '2.0000', cashPerShare: '0.0000' })
    )
    expect(cycleOf(timeline, 1).rows[1]).toMatchObject({
      kind: 'ROLL',
      net: { direction: 'even', perShare: '0.0000', total: '0.0000' }
    })
  })

  it("puts a roll's fees in its net and on its row", () => {
    const timeline = timelineOf(
      shortRollInput({
        buyBack: '3.0000',
        sellNew: '2.4000',
        cashPerShare: '0.6000',
        fees: '1.3000'
      })
    )
    expect(cycleOf(timeline, 1).rows[1]).toMatchObject({
      kind: 'ROLL',
      net: { direction: 'debit', perShare: '0.6130', total: '61.3000' },
      fees: '1.3000'
    })
  })

  it('signs a cycle bought back above its credit as a negative net', () => {
    const cycle = cycleOf(timelineOf(lossCycleInput()), 1)
    expect(cycle).toMatchObject({ netPerShare: '-0.5000', netTotal: '-50.0000' })
  })
})

describe('buildPmccTimeline — LEAPS roll date', () => {
  it.each([
    ['before', '2027-07-08', '2027-07-08'],
    ['the same day', '2027-07-09', '2027-07-09'],
    ['after', '2027-07-10', '2027-07-09']
  ])(
    'dates a roll whose replacement was bought %s the old LEAPS was sold (%s) by its earlier fill',
    (_when, leapsRollOpenedOn, date) => {
      const timeline = timelineOf(xyzBackground({ leapsRollOpenedOn }))
      expect(timeline.leapsTrack.rows[1]).toMatchObject({ kind: 'ROLL', number: 1, date })
    }
  )
})

describe('buildPmccTimeline — LEAPS roll coverage', () => {
  it.each([
    ['the day before', '2027-07-08', { unbroken: true, extensionDays: 126 }],
    ['the same day', '2027-07-09', { unbroken: true, extensionDays: 126 }],
    ['the day after', '2027-07-10', { unbroken: false, gapDays: 1, extensionDays: 126 }],
    ['two days after', '2027-07-11', { unbroken: false, gapDays: 2, extensionDays: 126 }]
  ])(
    'with the replacement bought %s the old one was sold (%s)',
    (_when, leapsRollOpenedOn, coverage) => {
      const timeline = timelineOf(xyzBackground({ leapsRollOpenedOn }))
      expect(timeline.leapsTrack.rows[1]).toMatchObject({ kind: 'ROLL' })
      expect(timeline.leapsTrack.rows[1]).toHaveProperty('coverage', coverage)
    }
  )
})

describe('buildPmccTimeline — assignment and close', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(
      xyzBackground({ cycle9AssignedOn: '2027-08-20', valuationDate: '2027-08-24' })
    )
  })

  it('ends cycle 9 by assignment with its net unchanged', () => {
    expect(cycleOf(timeline, 9)).toMatchObject({
      status: 'ENDED',
      outcome: 'ASSIGNED',
      endedOn: '2027-08-20',
      daysHeld: 28,
      netPerShare: '1.9500',
      netTotal: '195.0000',
      basisAfter: '6.5500'
    })
  })

  it('gives the assignment row no price and no total', () => {
    expect(cycleOf(timeline, 9).rows.at(-1)).toEqual({
      kind: 'END',
      date: '2027-08-20',
      outcome: 'ASSIGNED',
      contract: { strike: '118.0000', expiration: '2027-08-20' },
      pricePerShare: null,
      total: null,
      fees: '0.0000'
    })
  })

  it('adds a LEAPS close row with no basis, after a same-day short end', () => {
    const input = withEvents(
      xyzBackground({ cycle9AssignedOn: '2027-08-20', closedDate: '2027-08-20' }),
      // Recorded before the assignment (lower seq): only the rank puts it after.
      leapsCloseEvent(5, '2027-08-20', '37.2000')
    )
    const closed = timelineOf(input)
    expect(closed.leapsTrack.rows.at(-1)).toEqual({
      kind: 'CLOSE',
      date: '2027-08-20',
      contract: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '37.2000' },
      total: '3720.0000',
      fees: '0.0000'
    })
    expect(cycleOf(closed, 9).basisAfter).toBe('6.5500')
  })

  it('ends the window at the close date of a closed position', () => {
    const closed = timelineOf(
      xyzBackground({
        cycle9AssignedOn: '2027-08-20',
        valuationDate: '2027-09-02',
        closedDate: '2027-08-20'
      })
    )
    expect(closed).toMatchObject({
      windowEnd: '2027-08-20',
      valuationDate: '2027-09-02',
      closedDate: '2027-08-20'
    })
  })
})

describe('buildPmccTimeline — unknown roles', () => {
  it('lands an unknown leg inside the cycle open on its date and changes no figure', () => {
    const timeline = timelineOf(
      withEvents(xyzBackground(), unknownEvent(20, '2027-08-04', 'CC_CLOSE'))
    )
    const cycle9 = cycleOf(timeline, 9)
    expect(cycle9.rows.at(-1)).toEqual({ kind: 'UNKNOWN', date: '2027-08-04', role: 'CC_CLOSE' })
    expect(cycle9).toMatchObject({ netPerShare: '1.9500', netTotal: '195.0000' })
    expect(timeline.cycles).toHaveLength(9)
    expect(footers(timeline)).toEqual(BACKGROUND_FOOTERS)
  })

  describe('after a LEAPS roll inside the open cycle moved the ledger basis', () => {
    // The second LEAPS roll (2027-08-06) is a $2.00 credit while cycle 9 is open; cycle 9's own
    // last event is still its 2027-07-23 sale, so its footer stays $6.55.
    let without: PmccTimeline
    let withUnknown: PmccTimeline

    beforeAll(() => {
      const rolled = withEvents(xyzBackground(), secondLeapsRollEvent(20))
      without = timelineOf(rolled)
      withUnknown = timelineOf(withEvents(rolled, unknownEvent(21, '2027-08-10', 'CC_CLOSE')))
    })

    it("keeps cycle 9's footer at $6.55 without the unknown leg", () => {
      expect(cycleOf(without, 9).basisAfter).toBe('6.5500')
    })

    it("keeps cycle 9's footer at $6.55 with an unknown leg dated after the roll", () => {
      expect(cycleOf(withUnknown, 9).rows.at(-1)).toEqual({
        kind: 'UNKNOWN',
        date: '2027-08-10',
        role: 'CC_CLOSE'
      })
      expect(cycleOf(withUnknown, 9).basisAfter).toBe('6.5500')
    })

    it('changes no summary figure', () => {
      expect(withUnknown.summary).toEqual(without.summary)
    })
  })

  it('lands an unknown leg sold the day a cycle opens inside that cycle', () => {
    const timeline = timelineOf(
      withEvents(xyzBackground(), unknownEvent(20, '2027-07-23', 'CC_CLOSE'))
    )
    expect(cycleOf(timeline, 9).rows.map((row) => row.kind)).toEqual(['OPEN', 'UNKNOWN'])
  })

  it('lands an unknown leg dated in a gap on the LEAPS track, in date order', () => {
    const timeline = timelineOf(
      withEvents(xyzBackground(), unknownEvent(20, '2026-10-20', 'CC_CLOSE'))
    )
    expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN', 'ROLL'])
    expect(timeline.leapsTrack.rows[1]).toEqual({
      kind: 'UNKNOWN',
      date: '2026-10-20',
      role: 'CC_CLOSE'
    })
    expect(timeline.cycles.flatMap((c) => c.rows).map((row) => row.kind)).not.toContain('UNKNOWN')
  })

  it('lands an unknown leg dated after a buyback, before that short expired, on the LEAPS track', () => {
    // Cycle 1: $108 · 2026-11-20 sold 2026-10-23, bought back 2026-11-06 — ended, though its
    // short had not yet expired on 2026-11-13.
    const timeline = timelineOf(
      withEvents(lossCycleInput(), unknownEvent(3, '2026-11-13', 'CC_CLOSE'))
    )
    expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN'])
    expect(timeline.cycles.map(rowKinds)).toEqual([['OPEN', 'END']])
  })

  it('lands an unknown leg dated before the first short call on the LEAPS track', () => {
    const input = shortRollInput({ buyBack: '3.0000', sellNew: '2.4000', cashPerShare: '0.6000' })
    const timeline = timelineOf(withEvents(input, unknownEvent(3, '2026-10-01', 'CC_CLOSE')))
    expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN'])
    expect(timeline.cycles.map((c) => c.rows.map((row) => row.kind))).toEqual([['OPEN', 'ROLL']])
  })
})

describe('buildPmccTimeline — fees', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(xyzBackground({ leapsFees: '1.0000', cycle1Fees: '1.0000' }))
  })

  it('adds the purchase fee to the LEAPS basis and shows it on the row', () => {
    expect(timeline.leapsTrack.rows[0]).toMatchObject({
      kind: 'PURCHASE',
      total: '2500.0000',
      basisAfter: '25.0100',
      fees: '1.0000'
    })
  })

  it("takes the sell fee out of cycle 1's net and its footer", () => {
    expect(cycleOf(timeline, 1)).toMatchObject({
      netPerShare: '1.9900',
      netTotal: '199.0000',
      basisAfter: '23.0200'
    })
  })

  it('keeps the sell-to-open total gross and shows its fee beside it', () => {
    expect(cycleOf(timeline, 1).rows[0]).toMatchObject({
      kind: 'OPEN',
      total: '200.0000',
      fees: '1.0000'
    })
  })

  it('rounds a per-share net with a fifth decimal of 5 half-up', () => {
    // 200 − 0.015 = 199.985 dollars → 1.99985 per share → 1.9999 (half-even gives 1.9998).
    const rounded = timelineOf(xyzBackground({ cycle1Fees: '0.0150' }))
    expect(cycleOf(rounded, 1)).toMatchObject({ netPerShare: '1.9999', netTotal: '199.9850' })
  })
})

describe('buildPmccTimeline — contracts', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(xyzBackground({ contracts: 3 }))
  })

  it('scales totals with contracts and keeps per-share figures', () => {
    expect(cycleOf(timeline, 1)).toMatchObject({ netPerShare: '2.0000', netTotal: '600.0000' })
  })

  it('scales each row total with contracts', () => {
    expect(timeline.leapsTrack.rows[0]).toMatchObject({ kind: 'PURCHASE', total: '7500.0000' })
    expect(cycleOf(timeline, 1).rows[0]).toMatchObject({ kind: 'OPEN', total: '600.0000' })
  })

  it('replays the same per-share basis at every group boundary', () => {
    expect(footers(timeline)).toEqual(BACKGROUND_FOOTERS)
    expect(
      timeline.leapsTrack.rows.flatMap((row) => ('basisAfter' in row ? [row.basisAfter] : []))
    ).toEqual(['25.0000', '8.5000'])
  })
})

describe('buildPmccTimeline — no LEAPS', () => {
  it('has no timeline for a history with no LEAPS purchase or roll', () => {
    const shortOnly: PmccTimelineInput = {
      events: [shortOpenEvent(0, '2027-06-15')],
      valuationDate: '2027-08-13',
      closedDate: null
    }
    expect(buildPmccTimeline(shortOnly)).toBeNull()
  })
})

/** The cycle a gap follows; null for a leading or whole-window gap. */
const afterOf = (gap: PmccGap): number | null => ('afterCycle' in gap ? gap.afterCycle : null)

/** The gaps that follow cycle `number`; `null` selects the leading gap. */
const gapsAfter = (timeline: PmccTimeline, number: number | null): PmccGap[] =>
  timeline.gaps.filter((gap) => gap.kind !== 'WHOLE_WINDOW' && afterOf(gap) === number)

describe('buildPmccTimeline — uncovered stretches on the XYZ Background', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(xyzBackground())
  })

  it('lists every gap between an ended cycle and the next one, oldest first', () => {
    expect(timeline.gaps).toEqual([
      {
        kind: 'BETWEEN',
        afterCycle: 1,
        beforeCycle: 2,
        from: '2026-10-16',
        to: '2026-10-23',
        days: 7
      },
      {
        kind: 'BETWEEN',
        afterCycle: 2,
        beforeCycle: 3,
        from: '2026-12-18',
        to: '2027-01-04',
        days: 17
      },
      {
        kind: 'BETWEEN',
        afterCycle: 3,
        beforeCycle: 4,
        from: '2027-02-05',
        to: '2027-02-08',
        days: 3
      },
      {
        kind: 'BETWEEN',
        afterCycle: 4,
        beforeCycle: 5,
        from: '2027-03-12',
        to: '2027-03-15',
        days: 3
      },
      {
        kind: 'BETWEEN',
        afterCycle: 5,
        beforeCycle: 6,
        from: '2027-04-02',
        to: '2027-04-05',
        days: 3
      },
      {
        kind: 'BETWEEN',
        afterCycle: 7,
        beforeCycle: 8,
        from: '2027-06-18',
        to: '2027-06-22',
        days: 4
      },
      {
        kind: 'BETWEEN',
        afterCycle: 8,
        beforeCycle: 9,
        from: '2027-07-16',
        to: '2027-07-23',
        days: 7
      }
    ])
  })

  it('counts 44 of the 333 window days uncovered and 289 covered', () => {
    expect(timeline.summary).toMatchObject({ totalDays: 333, uncoveredDays: 44, coveredDays: 289 })
  })
})

describe('buildPmccTimeline — gap boundaries', () => {
  it.each([
    ['the day before', '2026-10-15', [], 37],
    ['the same day', '2026-10-16', [], 37],
    [
      'the day after',
      '2026-10-17',
      [
        {
          kind: 'BETWEEN',
          afterCycle: 1,
          beforeCycle: 2,
          from: '2026-10-16',
          to: '2026-10-17',
          days: 1
        }
      ],
      38
    ]
  ])(
    'with cycle 2 sold %s cycle 1 expired (%s)',
    (_when, cycle2Opened, expectedGaps, uncoveredDays) => {
      const timeline = timelineOf(withEventDate(xyzBackground(), 3, cycle2Opened))
      expect(cycleOf(timeline, 1)).toMatchObject({ status: 'ENDED', endedOn: '2026-10-16' })
      expect(cycleOf(timeline, 2)).toMatchObject({ openedOn: cycle2Opened, endedOn: '2026-12-18' })
      expect(gapsAfter(timeline, 1)).toEqual(expectedGaps)
      expect(timeline.summary.uncoveredDays).toBe(uncoveredDays)
    }
  )

  it.each([
    ['the day before', '2026-09-13', [], 44],
    ['the same day', '2026-09-14', [], 44],
    [
      'the day after',
      '2026-09-15',
      [{ kind: 'LEADING', beforeCycle: 1, from: '2026-09-14', to: '2026-09-15', days: 1 }],
      45
    ]
  ])(
    'with cycle 1 sold %s the LEAPS was bought (%s)',
    (_when, cycle1Opened, expectedGaps, uncoveredDays) => {
      const timeline = timelineOf(withEventDate(xyzBackground(), 1, cycle1Opened))
      expect(timeline.start).toBe('2026-09-14')
      expect(gapsAfter(timeline, null)).toEqual(expectedGaps)
      expect(timeline.summary.uncoveredDays).toBe(uncoveredDays)
    }
  )

  it.each([
    ['the day of', '2027-08-20', [], 340, 44],
    [
      'the day after',
      '2027-08-21',
      [{ kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-21', days: 1 }],
      341,
      45
    ],
    [
      'four days after',
      '2027-08-24',
      [{ kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-24', days: 4 }],
      344,
      48
    ]
  ])(
    'with the valuation date %s cycle 9 was assigned (%s), position open',
    (_when, valuationDate, expectedGaps, totalDays, uncoveredDays) => {
      const timeline = timelineOf(xyzBackground({ cycle9AssignedOn: '2027-08-20', valuationDate }))
      expect(gapsAfter(timeline, 9)).toEqual(expectedGaps)
      expect(timeline.summary).toMatchObject({
        totalDays,
        uncoveredDays,
        coveredDays: 296
      })
    }
  )

  it('ends a closed position window at its close date: no trailing gap after it', () => {
    const timeline = timelineOf(
      xyzBackground({
        cycle9AssignedOn: '2027-08-20',
        valuationDate: '2027-09-02',
        closedDate: '2027-08-20'
      })
    )
    expect(gapsAfter(timeline, 9)).toEqual([])
    expect(timeline.summary).toMatchObject({ totalDays: 340, uncoveredDays: 44, coveredDays: 296 })
  })

  it('counts a leading and a trailing gap around a single bought-back cycle', () => {
    const timeline = timelineOf(lossCycleInput())
    expect(timeline.gaps).toEqual([
      { kind: 'LEADING', beforeCycle: 1, from: '2026-09-14', to: '2026-10-23', days: 39 },
      { kind: 'TRAILING', afterCycle: 1, from: '2026-11-06', to: '2026-11-13', days: 7 }
    ])
    expect(timeline.summary).toMatchObject({ totalDays: 60, uncoveredDays: 46, coveredDays: 14 })
  })
})

describe('buildPmccTimeline — a LEAPS with no short call', () => {
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(leapsOnlyInput())
  })

  it('leaves the whole window as one uncovered stretch', () => {
    expect(timeline.cycles).toEqual([])
    expect(timeline.gaps).toEqual([
      { kind: 'WHOLE_WINDOW', from: '2027-06-01', to: '2027-08-13', days: 73 }
    ])
  })

  it('summarises no cycles: nothing covered and no average, open credit or roll net', () => {
    expect(timeline.summary).toEqual({
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
    })
  })

  it('has no gap on the day the LEAPS was bought', () => {
    const sameDay = timelineOf(leapsOnlyInput('2027-06-01'))
    expect(sameDay.gaps).toEqual([])
    expect(sameDay.summary).toMatchObject({
      totalDays: 0,
      uncoveredDays: 0,
      coveredDays: 0,
      basisPerShare: '19.8000'
    })
  })
})

describe('buildPmccTimeline — a valuation date before the first LEAPS fill', () => {
  // The user's local date can run ahead of New York's: the LEAPS (2027-06-01) is filled on a day
  // the Eastern valuation date has not reached yet.
  it.each([
    ['the day before', '2027-05-31', '2027-06-01', 0],
    ['the same day as', '2027-06-01', '2027-06-01', 0],
    ['the day after', '2027-06-02', '2027-06-02', 1]
  ])(
    'clamps the window to start on a valuation date %s the fill (%s)',
    (_when, valuationDate, windowEnd, totalDays) => {
      const timeline = timelineOf(leapsOnlyInput(valuationDate))
      expect(timeline).toMatchObject({ start: '2027-06-01', windowEnd, valuationDate })
      expect(timeline.summary).toMatchObject({
        totalDays,
        uncoveredDays: totalDays,
        coveredDays: 0
      })
    }
  )

  /** The LEAPS and cycle 1 (sold the same day, 2026-09-14), cycle 1 still open. */
  const openFirstCycle = (valuationDate: string): PmccTimelineInput => ({
    events: xyzBackground().events.filter((event) => event.seq <= 1),
    valuationDate,
    closedDate: null
  })

  // Cycle 1's $110 expires 2026-10-16: 32 days after the clamped window end of 2026-09-14.
  it.each([
    ['the day before', '2026-09-13', 0, 32],
    ['the same day as', '2026-09-14', 0, 32],
    ['the day after', '2026-09-15', 1, 31]
  ])(
    'counts no negative days so far on a cycle valued %s its sale (%s)',
    (_when, valuationDate, daysSoFar, dteRemaining) => {
      const timeline = timelineOf(openFirstCycle(valuationDate))
      expect(cycleOf(timeline, 1)).toMatchObject({ status: 'OPEN', daysSoFar, dteRemaining })
      expect(timeline.summary).toMatchObject({
        totalDays: daysSoFar,
        uncoveredDays: 0,
        coveredDays: daysSoFar
      })
    }
  )
})

describe('buildPmccTimeline — a short call sold or ended around the window end', () => {
  // The $95 LEAPS was bought 2027-06-01 and the window ends at the Eastern valuation date,
  // 2027-06-05; a short entered on the user's local date can fall after it. The $118 ·
  // 2027-07-16 short is 42 DTE on 2027-06-04.
  it.each([
    [
      'the day before',
      '2027-06-04',
      { daysSoFar: 1, dteRemaining: 41, dteAtOpen: 42 },
      [{ kind: 'LEADING', beforeCycle: 1, from: '2027-06-01', to: '2027-06-04', days: 3 }],
      { uncoveredDays: 3, coveredDays: 1 }
    ],
    [
      'the day of',
      '2027-06-05',
      { daysSoFar: 0, dteRemaining: 41, dteAtOpen: 41 },
      [{ kind: 'LEADING', beforeCycle: 1, from: '2027-06-01', to: '2027-06-05', days: 4 }],
      { uncoveredDays: 4, coveredDays: 0 }
    ],
    [
      'the day after',
      '2027-06-06',
      { daysSoFar: 0, dteRemaining: 40, dteAtOpen: 40 },
      [{ kind: 'LEADING', beforeCycle: 1, from: '2027-06-01', to: '2027-06-05', days: 4 }],
      { uncoveredDays: 4, coveredDays: 0 }
    ]
  ])(
    'keeps a short sold %s the window end (%s) inside the window, with no more DTE than it was sold at',
    (_when, soldOn, status, gaps, days) => {
      const timeline = timelineOf(
        withEvents(leapsOnlyInput('2027-06-05'), shortOpenEvent(1, soldOn))
      )
      expect(cycleOf(timeline, 1)).toMatchObject({ status: 'OPEN', ...status })
      expect(timeline.gaps).toEqual(gaps)
      expect(timeline.summary).toMatchObject({ totalDays: 4, ...days })
    }
  )

  it.each([
    [
      'the day before',
      '2027-06-04',
      [
        { kind: 'LEADING', beforeCycle: 1, from: '2027-06-01', to: '2027-06-02', days: 1 },
        { kind: 'TRAILING', afterCycle: 1, from: '2027-06-04', to: '2027-06-05', days: 1 }
      ],
      { uncoveredDays: 2, coveredDays: 2 }
    ],
    [
      'the day of',
      '2027-06-05',
      [{ kind: 'LEADING', beforeCycle: 1, from: '2027-06-01', to: '2027-06-02', days: 1 }],
      { uncoveredDays: 1, coveredDays: 3 }
    ],
    [
      'the day after',
      '2027-06-06',
      [{ kind: 'LEADING', beforeCycle: 1, from: '2027-06-01', to: '2027-06-02', days: 1 }],
      { uncoveredDays: 1, coveredDays: 3 }
    ]
  ])(
    'counts a short bought back %s the window end (%s) as covering only up to the window end',
    (_when, boughtBackOn, gaps, days) => {
      const timeline = timelineOf(
        withEvents(
          leapsOnlyInput('2027-06-05'),
          shortOpenEvent(1, '2027-06-02'),
          shortEnd(2, boughtBackOn, '118.0000', '2027-07-16', '0.5000')
        )
      )
      expect(timeline.gaps).toEqual(gaps)
      expect(timeline.summary).toMatchObject({ totalDays: 4, ...days })
    }
  )

  it('ends a gap before a short sold after the window end at the window end', () => {
    const timeline = timelineOf(
      withEvents(
        leapsOnlyInput('2027-06-05'),
        shortOpenEvent(1, '2027-06-01'),
        shortEnd(2, '2027-06-03', '118.0000', '2027-07-16', '0.5000'),
        shortSaleEvent(3, '2027-06-07', {
          strike: '120.0000',
          expiration: '2027-07-16',
          price: '1.0000'
        })
      )
    )
    expect(timeline.gaps).toEqual([
      {
        kind: 'BETWEEN',
        afterCycle: 1,
        beforeCycle: 2,
        from: '2027-06-03',
        to: '2027-06-05',
        days: 2
      }
    ])
    expect(timeline.summary).toMatchObject({ totalDays: 4, uncoveredDays: 2, coveredDays: 2 })
  })
})

describe('buildPmccTimeline — overlapping short calls', () => {
  // Cycle 1: $120 · 2027-03-19 sold 2027-01-04, open. Cycle 2: $115 · 2027-01-29 sold
  // 2027-01-10, expired 2027-01-29. The LEAPS was bought 2026-09-14.
  it('counts the days cycle 1 still covers after cycle 2 expired as covered', () => {
    const timeline = timelineOf(overlappingCyclesInput())
    expect(cycleOf(timeline, 1)).toMatchObject({ status: 'OPEN', daysSoFar: 37 })
    expect(cycleOf(timeline, 2)).toMatchObject({ status: 'ENDED', endedOn: '2027-01-29' })
    expect(timeline.gaps).toEqual([
      { kind: 'LEADING', beforeCycle: 1, from: '2026-09-14', to: '2027-01-04', days: 112 }
    ])
    expect(timeline.summary).toMatchObject({ totalDays: 149, uncoveredDays: 112, coveredDays: 37 })
  })

  it('starts the trailing gap when the cycle that covered longest stopped, not the last sold', () => {
    const timeline = timelineOf({ ...overlappingCyclesInput(), valuationDate: '2027-03-25' })
    expect(cycleOf(timeline, 1)).toMatchObject({ status: 'UNRECORDED', expiredOn: '2027-03-19' })
    expect(gapsAfter(timeline, 1)).toEqual([
      { kind: 'TRAILING', afterCycle: 1, from: '2027-03-19', to: '2027-03-25', days: 6 }
    ])
    expect(timeline.summary).toMatchObject({ totalDays: 192, uncoveredDays: 118, coveredDays: 74 })
  })

  it('names the cycles either side of an uncovered stretch as its neighbours', () => {
    const input = withEvents(
      overlappingCyclesInput(),
      shortExpiredEvent(4, '120.0000', '2027-03-19'),
      shortSaleEvent(5, '2027-03-22', {
        strike: '125.0000',
        expiration: '2027-04-16',
        price: '1.5000'
      })
    )
    const timeline = timelineOf({ ...input, valuationDate: '2027-03-25' })
    expect(timeline.gaps).toEqual([
      { kind: 'LEADING', beforeCycle: 1, from: '2026-09-14', to: '2027-01-04', days: 112 },
      {
        kind: 'BETWEEN',
        afterCycle: 1,
        beforeCycle: 3,
        from: '2027-03-19',
        to: '2027-03-22',
        days: 3
      }
    ])
    expect(timeline.summary).toMatchObject({ uncoveredDays: 115, coveredDays: 77 })
  })

  it('follows the later of two cycles that stopped covering the same day', () => {
    const input = withEvents(
      overlappingCyclesInput(),
      shortEnd(4, '2027-01-29', '120.0000', '2027-03-19', '0.5000')
    )
    expect(gapsAfter(timelineOf(input), 2)).toEqual([
      { kind: 'TRAILING', afterCycle: 2, from: '2027-01-29', to: '2027-02-10', days: 12 }
    ])
  })

  it.each([
    ['the day before', '2027-03-18', ['OPEN', 'UNKNOWN'], ['PURCHASE']],
    ['the day of', '2027-03-19', ['OPEN', 'UNKNOWN'], ['PURCHASE']],
    ['the day after', '2027-03-20', ['OPEN'], ['PURCHASE', 'UNKNOWN']]
  ])(
    'lands an unknown leg dated %s cycle 1 expires (%s), after cycle 2 ended, in cycle 1 only while it is open',
    (_when, date, cycle1Kinds, leapsKinds) => {
      const input = withEvents(overlappingCyclesInput(), unknownEvent(4, date, 'CC_CLOSE'))
      const timeline = timelineOf({ ...input, valuationDate: '2027-03-25' })
      expect(rowKinds(cycleOf(timeline, 1))).toEqual(cycle1Kinds)
      expect(rowKinds(cycleOf(timeline, 2))).toEqual(['OPEN', 'END'])
      expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(leapsKinds)
    }
  )
})

describe('buildPmccTimeline — a short call that outlasts the LEAPS', () => {
  it.each([
    ['29 days after', '2027-10-16', { daysPastLeaps: 29, leapsExpiration: '2027-09-17' }],
    ['the day after', '2027-09-18', { daysPastLeaps: 1, leapsExpiration: '2027-09-17' }],
    ['the same day as', '2027-09-17', null],
    ['the day before', '2027-09-16', null]
  ])('flags a short expiring %s the LEAPS (%s)', (_when, shortExpiration, flag) => {
    const cycle = cycleOf(timelineOf(outlastingShortInput(shortExpiration)), 1)
    expect(cycle.current.expiration).toBe(shortExpiration)
    expect(cycle.flag).toEqual(flag)
  })

  // The $120 · 2027-10-16 short outlasts the $90 · 2027-09-17 LEAPS; valued 2027-10-20.
  it.each([
    ['the day before', '2027-09-16', null],
    ['the same day as', '2027-09-17', null],
    ['the day after', '2027-09-18', { daysPastLeaps: 1, leapsExpiration: '2027-09-17' }]
  ])(
    'flags an outlasting short bought back %s the LEAPS expired (%s) only once it ran past it',
    (_when, boughtBackOn, flag) => {
      const input = withEvents(
        outlastingShortInput('2027-10-16'),
        shortEnd(2, boughtBackOn, '120.0000', '2027-10-16', '0.5000')
      )
      const cycle = cycleOf(timelineOf({ ...input, valuationDate: '2027-10-20' }), 1)
      expect(cycle).toMatchObject({ status: 'ENDED', endedOn: boughtBackOn })
      expect(cycle.flag).toEqual(flag)
    }
  )

  it('flags an outlasting short past its expiration with no outcome recorded by the days it outlasted the LEAPS', () => {
    const input = { ...outlastingShortInput('2027-10-16'), valuationDate: '2027-10-20' }
    const cycle = cycleOf(timelineOf(input), 1)
    expect(cycle).toMatchObject({ status: 'UNRECORDED', expiredOn: '2027-10-16' })
    expect(cycle.flag).toEqual({ daysPastLeaps: 29, leapsExpiration: '2027-09-17' })
  })

  it('flags no cycle on the Background, whose shorts all expire before the LEAPS held now', () => {
    const timeline = timelineOf(xyzBackground())
    expect(timeline.cycles.map((c) => c.flag)).toEqual(Array(9).fill(null))
  })
})

describe('buildPmccTimeline — a short call past its expiration with no recorded outcome', () => {
  // Cycle 9's $118 · 2027-08-20 short, sold 2027-07-23, valued 2027-08-24 with no expiration,
  // assignment or buyback recorded.
  let timeline: PmccTimeline

  beforeAll(() => {
    timeline = timelineOf(xyzBackground({ valuationDate: '2027-08-24' }))
  })

  it('states cycle 9 as expired 2027-08-20 with no outcome recorded, held 28 days, with no DTE left', () => {
    const cycle9 = cycleOf(timeline, 9)
    expect(cycle9).toMatchObject({ status: 'UNRECORDED', expiredOn: '2027-08-20', daysHeld: 28 })
    expect(cycle9).not.toHaveProperty('dteRemaining')
    expect(cycle9).not.toHaveProperty('daysSoFar')
    expect(cycle9).not.toHaveProperty('outcome')
    expect(rowKinds(cycle9)).toEqual(['OPEN'])
  })

  it('ends its coverage at the expiration: a 4-day trailing gap to the valuation date', () => {
    expect(gapsAfter(timeline, 9)).toEqual([
      { kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-24', days: 4 }
    ])
    expect(timeline.summary).toMatchObject({ totalDays: 344, uncoveredDays: 48, coveredDays: 296 })
  })

  it('still counts it as open: its credit is not realized until the outcome is recorded', () => {
    expect(timeline.summary).toMatchObject({
      cycleCount: 9,
      closedCount: 8,
      open: { count: 1, creditPerShare: '1.9500' },
      realizedPerShare: '14.0000',
      realizedTotal: '1400.0000',
      average: { perShare: '1.7500', total: '175.0000' }
    })
  })

  it.each([
    [
      'the day before',
      '2027-08-19',
      { status: 'OPEN', daysSoFar: 27, dteRemaining: 1 },
      [],
      { totalDays: 339, uncoveredDays: 44 }
    ],
    [
      'the day of',
      '2027-08-20',
      { status: 'OPEN', daysSoFar: 28, dteRemaining: 0 },
      [],
      { totalDays: 340, uncoveredDays: 44 }
    ],
    [
      'the day after',
      '2027-08-21',
      { status: 'UNRECORDED', expiredOn: '2027-08-20', daysHeld: 28 },
      [{ kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-21', days: 1 }],
      { totalDays: 341, uncoveredDays: 45 }
    ]
  ])(
    'reads cycle 9 valued %s its expiration (%s)',
    (_when, valuationDate, status, expectedGaps, days) => {
      const valued = timelineOf(xyzBackground({ valuationDate }))
      expect(cycleOf(valued, 9)).toMatchObject(status)
      expect(gapsAfter(valued, 9)).toEqual(expectedGaps)
      expect(valued.summary).toMatchObject(days)
    }
  )

  it.each([
    ['before', '2027-08-18', { status: 'OPEN', daysSoFar: 26, dteRemaining: 2 }],
    ['on', '2027-08-20', { status: 'OPEN', daysSoFar: 28, dteRemaining: 0 }],
    ['after', '2027-08-21', { status: 'UNRECORDED', expiredOn: '2027-08-20', daysHeld: 28 }]
  ])(
    'measures cycle 9 of a position closed %s its expiration (%s) to the close date, not the later valuation date',
    (_when, closedDate, status) => {
      const closed = timelineOf(xyzBackground({ valuationDate: '2027-09-02', closedDate }))
      expect(cycleOf(closed, 9)).toMatchObject(status)
    }
  )

  it('turns ended and expired, keeping its 28 days and its gap, once the expiration is recorded', () => {
    const recorded = timelineOf(
      withEvents(xyzBackground({ valuationDate: '2027-08-24' }), cycle9ExpiredEvent(20))
    )
    expect(cycleOf(recorded, 9)).toMatchObject({
      status: 'ENDED',
      outcome: 'EXPIRED',
      endedOn: '2027-08-20',
      daysHeld: 28
    })
    expect(gapsAfter(recorded, 9)).toEqual([
      { kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-08-24', days: 4 }
    ])
    expect(recorded.summary).toMatchObject({ closedCount: 9, open: null, uncoveredDays: 48 })
  })
})

describe('buildPmccTimeline — the timeline summary', () => {
  it('totals the Background: 8 cycles realized, cycle 9 open, reconciling to the ledger', () => {
    expect(timelineOf(xyzBackground()).summary).toEqual({
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
    })
  })

  it('realizes cycle 9 once it is assigned, and has no open credit', () => {
    const timeline = timelineOf(
      xyzBackground({ cycle9AssignedOn: '2027-08-20', valuationDate: '2027-08-24' })
    )
    expect(timeline.summary).toMatchObject({
      cycleCount: 9,
      closedCount: 9,
      open: null,
      realizedPerShare: '15.9500',
      realizedTotal: '1595.0000',
      // 1595 ÷ 9 = 177.2222…
      average: { perShare: '1.7722', total: '177.2222' }
    })
  })

  it('carries fees into the realized net and the ledger figures', () => {
    const timeline = timelineOf(xyzBackground({ leapsFees: '1.0000', cycle1Fees: '1.0000' }))
    expect(timeline.summary).toMatchObject({
      realizedPerShare: '13.9900',
      realizedTotal: '1399.0000',
      shortCreditsPerShare: '15.9400',
      leapsCostPerShare: '22.5100',
      basisPerShare: '6.5700'
    })
  })

  it('keeps per-share figures and scales totals with three contracts', () => {
    expect(timelineOf(xyzBackground({ contracts: 3 })).summary).toMatchObject({
      realizedPerShare: '14.0000',
      realizedTotal: '4200.0000',
      average: { perShare: '1.7500', total: '525.0000' },
      open: { count: 1, creditPerShare: '1.9500' },
      leapsRollNetPerShare: '2.5000',
      basisPerShare: '6.5500'
    })
  })

  it('signs a realized loss and its average as negative', () => {
    expect(timelineOf(lossCycleInput()).summary).toMatchObject({
      closedCount: 1,
      open: null,
      realizedPerShare: '-0.5000',
      realizedTotal: '-50.0000',
      average: { perShare: '-0.5000', total: '-50.0000' },
      leapsRollNetPerShare: null
    })
  })

  it.each([
    ['a credit', { buyPrice: '22.0000', cashPerShare: '-2.0000' }, '4.5000'],
    ['a debit', { buyPrice: '27.0000', cashPerShare: '3.0000' }, '-0.5000']
  ])('adds a second LEAPS roll for %s into the signed roll net', (_kind, roll, rollNet) => {
    const timeline = timelineOf(withEvents(xyzBackground(), secondLeapsRollEvent(20, roll)))
    expect(timeline.summary.leapsRollNetPerShare).toBe(rollNet)
  })

  it('changes no summary figure for an unknown leg', () => {
    const background = timelineOf(xyzBackground())
    const withUnknown = timelineOf(
      withEvents(xyzBackground(), unknownEvent(20, '2027-08-04', 'CC_CLOSE'))
    )
    expect(cycleOf(withUnknown, 9).rows.at(-1)).toMatchObject({ kind: 'UNKNOWN' })
    expect(withUnknown.summary).toMatchObject({ cycleCount: 9, basisPerShare: '6.5500' })
    expect(withUnknown.summary).toEqual(background.summary)
  })
})

describe('buildPmccTimeline — which cycle a short end belongs to', () => {
  it('ends the cycle holding the contract when the next cycle was sold first', () => {
    // Cycle 2 sold 2026-10-15, the day before cycle 1's $110 · 2026-10-16 expired.
    const timeline = timelineOf(withEventDate(xyzBackground(), 3, '2026-10-15'))
    expect(cycleOf(timeline, 1).rows.map((row) => row.kind)).toEqual(['OPEN', 'END'])
    expect(cycleOf(timeline, 2).rows.map((row) => row.kind)).toEqual(['OPEN', 'ROLL', 'END'])
    expect(cycleOf(timeline, 1).basisAfter).toBe('21.2000')
  })

  it('attaches a short end whose contract no cycle holds to the latest cycle while it is open', () => {
    const stray: PmccTimelineEvent = {
      kind: 'SHORT_END',
      seq: 20,
      date: '2027-08-06',
      contracts: 1,
      outcome: 'EXPIRED',
      contract: { strike: '999.0000', expiration: '2027-08-06' },
      pricePerShare: null,
      contribution: { side: 'SHORT', cashPerShare: '0.0000', contracts: 1, fees: '0.0000' }
    }
    const timeline = timelineOf(withEvents(xyzBackground(), stray))
    expect(cycleOf(timeline, 9)).toMatchObject({ status: 'ENDED', endedOn: '2027-08-06' })
    expect(cycleOf(timeline, 9).rows.map((row) => row.kind)).toEqual(['OPEN', 'END'])
    expect(timeline.summary.unattributedShortPerShare).toBeNull()
  })
})

describe('buildPmccTimeline — a short roll or end no cycle holds, after the latest cycle ended', () => {
  // Cycle 1: $112 · 2027-02-05 sold 2027-01-04, expired 2027-02-05. Valued 2027-03-15.
  it.each([
    ['end', strayShortCloseEvent(3, '2027-03-01', '0.6000'), 'SHORT_END', '-0.6000'],
    ['roll', strayShortRollEvent(3, '2027-03-01'), 'SHORT_ROLL', '1.0000']
  ])(
    'leaves the ended cycle alone and lists the stray %s on the LEAPS track as unattributed',
    (_kind, stray, role, unattributed) => {
      const timeline = timelineOf(withEvents(endedCycleInput(), stray))
      expect(timeline.cycles).toHaveLength(1)
      expect(cycleOf(timeline, 1)).toMatchObject({
        status: 'ENDED',
        outcome: 'EXPIRED',
        endedOn: '2027-02-05',
        daysHeld: 32,
        netPerShare: '1.7000',
        basisAfter: '23.3000'
      })
      expect(rowKinds(cycleOf(timeline, 1))).toEqual(['OPEN', 'END'])
      expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN'])
      expect(timeline.leapsTrack.rows[1]).toEqual({ kind: 'UNKNOWN', date: '2027-03-01', role })
      expect(timeline.summary).toMatchObject({
        realizedPerShare: '1.7000',
        open: null,
        unattributedShortPerShare: unattributed
      })
    }
  )

  it('keeps the trailing gap from the day the cycle expired', () => {
    const timeline = timelineOf(
      withEvents(endedCycleInput(), strayShortCloseEvent(3, '2027-03-01', '0.6000'))
    )
    expect(gapsAfter(timeline, 1)).toEqual([
      { kind: 'TRAILING', afterCycle: 1, from: '2027-02-05', to: '2027-03-15', days: 38 }
    ])
    // 2026-09-14 → 2027-03-15 is 182 days; uncovered 112 before the sale + 38 after it.
    expect(timeline.summary).toMatchObject({ totalDays: 182, uncoveredDays: 150, coveredDays: 32 })
  })
})

describe("buildPmccTimeline — a duplicate roll or end for an ended cycle's contract", () => {
  // Cycle 1: $112 · 2027-02-05 sold 2027-01-04 at 1.70, expired 2027-02-05. Valued 2027-03-15.
  /** Buys the ended $112 · 2027-02-05 back at 0.50 and sells a $116 · 2027-04-16 at 1.50. */
  const duplicateRoll = (seq: number, date: string): PmccTimelineEvent => ({
    kind: 'SHORT_ROLL',
    seq,
    date,
    contracts: 1,
    from: { strike: '112.0000', expiration: '2027-02-05', pricePerShare: '0.5000' },
    to: { strike: '116.0000', expiration: '2027-04-16', pricePerShare: '1.5000' },
    contribution: { side: 'SHORT', cashPerShare: '-1.0000', contracts: 1, fees: '0.0000' }
  })
  const duplicates: [string, (seq: number) => PmccTimelineEvent, string, string][] = [
    [
      'end',
      (seq) => shortEnd(seq, '2027-03-01', '112.0000', '2027-02-05', '0.6000'),
      'SHORT_END',
      '-0.6000'
    ],
    ['roll', (seq) => duplicateRoll(seq, '2027-03-01'), 'SHORT_ROLL', '1.0000']
  ]

  const expectCycle1Untouched = (timeline: PmccTimeline): void => {
    expect(cycleOf(timeline, 1)).toMatchObject({
      status: 'ENDED',
      outcome: 'EXPIRED',
      endedOn: '2027-02-05',
      daysHeld: 32,
      rollCount: 0,
      current: { strike: '112.0000', expiration: '2027-02-05' },
      netPerShare: '1.7000',
      netTotal: '170.0000',
      basisAfter: '23.3000'
    })
    expect(cycleOf(timeline, 1).rows).toEqual([
      {
        kind: 'OPEN',
        date: '2027-01-04',
        contract: { strike: '112.0000', expiration: '2027-02-05', pricePerShare: '1.7000' },
        total: '170.0000',
        fees: '0.0000'
      },
      {
        kind: 'END',
        date: '2027-02-05',
        contract: { strike: '112.0000', expiration: '2027-02-05' },
        fees: '0.0000',
        outcome: 'EXPIRED',
        pricePerShare: null,
        total: null
      }
    ])
  }

  it.each(duplicates)(
    'leaves the ended cycle alone and lists the duplicate %s on the LEAPS track as unattributed',
    (_kind, duplicate, role, unattributed) => {
      const timeline = timelineOf(withEvents(endedCycleInput(), duplicate(3)))
      expect(timeline.cycles).toHaveLength(1)
      expectCycle1Untouched(timeline)
      expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN'])
      expect(timeline.leapsTrack.rows[1]).toEqual({ kind: 'UNKNOWN', date: '2027-03-01', role })
      expect(timeline.summary).toMatchObject({
        realizedPerShare: '1.7000',
        open: null,
        unattributedShortPerShare: unattributed
      })
    }
  )

  it.each(duplicates)(
    'does not hand the duplicate %s to an unrelated open cycle: it stays unattributed',
    (_kind, duplicate, role, unattributed) => {
      // Cycle 2: $118 · 2027-07-16 sold 2027-02-20 at 1.20, still open on 2027-03-01.
      const timeline = timelineOf(
        withEvents(endedCycleInput(), shortOpenEvent(3, '2027-02-20'), duplicate(4))
      )
      expectCycle1Untouched(timeline)
      expect(cycleOf(timeline, 2)).toMatchObject({
        status: 'OPEN',
        rollCount: 0,
        current: { strike: '118.0000', expiration: '2027-07-16' },
        netPerShare: '1.2000'
      })
      expect(rowKinds(cycleOf(timeline, 2))).toEqual(['OPEN'])
      expect(timeline.leapsTrack.rows[1]).toEqual({ kind: 'UNKNOWN', date: '2027-03-01', role })
      expect(timeline.summary).toMatchObject({
        open: { count: 1, creditPerShare: '1.2000' },
        unattributedShortPerShare: unattributed
      })
    }
  )

  it.each([
    ['as recorded', (input: PmccTimelineInput) => input],
    ['reversed', reversed]
  ])(
    'takes a second end of the contract on its expiry day as unattributed, not as a re-end (%s)',
    (_order, arrange) => {
      const input = withEvents(
        endedCycleInput(),
        shortEnd(3, '2027-02-05', '112.0000', '2027-02-05', '0.6000')
      )
      const timeline = timelineOf(arrange(input))
      expectCycle1Untouched(timeline)
      expect(timeline.leapsTrack.rows[1]).toEqual({
        kind: 'UNKNOWN',
        date: '2027-02-05',
        role: 'SHORT_END'
      })
      expect(timeline.summary.unattributedShortPerShare).toBe('-0.6000')
    }
  )

  it.each([
    ['end', shortEnd(5, '2027-03-01', '108.0000', '2026-11-20', '0.6000'), 'SHORT_END', '-0.6000'],
    [
      'roll',
      {
        // Buys the $108 · 2026-11-20 back at 0.50 and sells a $116 · 2027-04-16 at 1.50.
        ...duplicateRoll(5, '2027-03-01'),
        from: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '0.5000' }
      },
      'SHORT_ROLL',
      '1.0000'
    ]
  ])(
    'takes a stray %s giving up the contract an ended cycle rolled away from as unattributed, not the open cycle',
    (_kind, stray, role, unattributed) => {
      // Cycle 1: $108 · 2026-11-20 sold 2026-10-23, rolled 2026-11-06 to the $112 · 2026-12-18,
      // which expired. Cycle 2: $118 · 2027-07-16 sold 2027-02-20, open.
      const input = withEvents(
        shortRollInput({ buyBack: '3.0000', sellNew: '2.4000', cashPerShare: '0.6000' }),
        shortExpiredEvent(3, '112.0000', '2026-12-18'),
        shortOpenEvent(4, '2027-02-20'),
        stray
      )
      const timeline = timelineOf({ ...input, valuationDate: '2027-03-15' })
      expect(timeline.cycles.map(rowKinds)).toEqual([['OPEN', 'ROLL', 'END'], ['OPEN']])
      expect(cycleOf(timeline, 2)).toMatchObject({ status: 'OPEN', netPerShare: '1.2000' })
      expect(timeline.leapsTrack.rows[1]).toEqual({ kind: 'UNKNOWN', date: '2027-03-01', role })
      expect(timeline.summary.unattributedShortPerShare).toBe(unattributed)
    }
  )

  it('takes a stray end of the contract an ended cycle rolled to as unattributed, not the open cycle', () => {
    // Cycle 1: $108 · 2026-11-20 sold 2026-10-23, rolled 2026-11-06 to the $112 · 2026-12-18,
    // which expired. Cycle 2: $118 · 2027-07-16 sold 2027-02-20, open. Cycle 1 held the $112
    // only through its roll, never as its opening contract.
    const input = withEvents(
      shortRollInput({ buyBack: '3.0000', sellNew: '2.4000', cashPerShare: '0.6000' }),
      shortExpiredEvent(3, '112.0000', '2026-12-18'),
      shortOpenEvent(4, '2027-02-20'),
      shortEnd(5, '2027-03-01', '112.0000', '2026-12-18', '0.6000')
    )
    const timeline = timelineOf({ ...input, valuationDate: '2027-03-15' })
    expect(timeline.cycles.map(rowKinds)).toEqual([['OPEN', 'ROLL', 'END'], ['OPEN']])
    expect(timeline.leapsTrack.rows[1]).toEqual({
      kind: 'UNKNOWN',
      date: '2027-03-01',
      role: 'SHORT_END'
    })
    expect(timeline.summary.unattributedShortPerShare).toBe('-0.6000')
  })

  it('ends a cycle that re-sold an ended contract, not the ended cycle and not unattributed', () => {
    // Cycle 1: $108 · 2026-11-20 sold 2026-10-23 at 1.00, bought back 2026-11-06 at 1.50.
    const resold: PmccTimelineEvent = {
      kind: 'SHORT_OPEN',
      seq: 3,
      date: '2026-11-09',
      contracts: 1,
      contract: { strike: '108.0000', expiration: '2026-11-20', pricePerShare: '1.2000' },
      contribution: { side: 'SHORT', cashPerShare: '-1.2000', contracts: 1, fees: '0.0000' }
    }
    const timeline = timelineOf(
      withEvents(
        lossCycleInput(),
        resold,
        shortEnd(4, '2026-11-12', '108.0000', '2026-11-20', '0.4000')
      )
    )
    expect(timeline.cycles.map(rowKinds)).toEqual([
      ['OPEN', 'END'],
      ['OPEN', 'END']
    ])
    expect(cycleOf(timeline, 1)).toMatchObject({ endedOn: '2026-11-06', netPerShare: '-0.5000' })
    expect(cycleOf(timeline, 2)).toMatchObject({
      status: 'ENDED',
      outcome: 'CLOSED',
      endedOn: '2026-11-12',
      daysHeld: 3,
      netPerShare: '0.8000'
    })
    expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE'])
    expect(timeline.summary.unattributedShortPerShare).toBeNull()
  })
})

describe('buildPmccTimeline — a short roll or end folded before any cycle exists', () => {
  it('lists a short roll as a neutral LEAPS-track row and carries its credit as unattributed', () => {
    const timeline = timelineOf(withEvents(leapsOnlyInput(), strayShortRollEvent(1, '2027-06-15')))
    expect(timeline.cycles).toEqual([])
    expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(['PURCHASE', 'UNKNOWN'])
    expect(timeline.leapsTrack.rows[1]).toEqual({
      kind: 'UNKNOWN',
      date: '2027-06-15',
      role: 'SHORT_ROLL'
    })
    expect(timeline.summary).toMatchObject({
      realizedPerShare: '0.0000',
      open: null,
      unattributedShortPerShare: '1.0000',
      shortCreditsPerShare: '1.0000',
      basisPerShare: '18.8000'
    })
  })

  it('carries a buyback and its fee as a negative unattributed figure', () => {
    const timeline = timelineOf(
      withEvents(leapsOnlyInput(), strayShortCloseEvent(1, '2027-06-15', '0.6000', '1.0000'))
    )
    expect(timeline.cycles).toEqual([])
    expect(timeline.leapsTrack.rows[1]).toEqual({
      kind: 'UNKNOWN',
      date: '2027-06-15',
      role: 'SHORT_END'
    })
    expect(timeline.summary).toMatchObject({
      realizedPerShare: '0.0000',
      open: null,
      unattributedShortPerShare: '-0.6100',
      shortCreditsPerShare: '-0.6100',
      basisPerShare: '20.4100'
    })
  })

  it('sums unattributed dollars before dividing once, half-up: −$0.0050 is −0.0001 a share', () => {
    const timeline = timelineOf(
      withEvents(
        leapsOnlyInput(),
        strayShortCloseEvent(1, '2027-06-15', '0.0000', '0.0025'),
        strayShortCloseEvent(2, '2027-06-20', '0.0000', '0.0025')
      )
    )
    expect(timeline.summary).toMatchObject({
      unattributedShortPerShare: '-0.0001',
      shortCreditsPerShare: '-0.0001'
    })
  })

  it.each([
    ['the day before', '2027-06-14', ['PURCHASE', 'UNKNOWN'], ['OPEN'], '1.0000'],
    ['the day after', '2027-06-16', ['PURCHASE'], ['OPEN', 'ROLL'], null]
  ])(
    'with a roll %s the first short call is sold, unattributed only before it (%s)',
    (_when, rolledOn, leapsKinds, cycleKinds, unattributed) => {
      const timeline = timelineOf(
        withEvents(
          leapsOnlyInput(),
          shortOpenEvent(1, '2027-06-15'),
          strayShortRollEvent(2, rolledOn)
        )
      )
      expect(timeline.leapsTrack.rows.map((row) => row.kind)).toEqual(leapsKinds)
      expect(timeline.cycles.map((c) => c.rows.map((row) => row.kind))).toEqual([cycleKinds])
      expect(timeline.summary).toMatchObject({
        unattributedShortPerShare: unattributed,
        shortCreditsPerShare: '2.2000'
      })
    }
  )
})

type ShortEndEvent = Extract<PmccTimelineEvent, { kind: 'SHORT_END' }>
type EndRow = Extract<PmccCycleRow, { kind: 'END' }>
type EndEventWith<Fields> = Omit<ShortEndEvent, 'outcome' | 'pricePerShare'> & Fields
type EndRowWith<Fields> = Omit<EndRow, 'outcome' | 'pricePerShare' | 'total'> & Fields

describe('PmccTimelineEvent and PmccCycleRow — only a close has a buyback price', () => {
  it('admits a close with its price and an expiry or assignment with none', () => {
    expectTypeOf<
      EndEventWith<{ outcome: 'CLOSED'; pricePerShare: string }>
    >().toExtend<PmccTimelineEvent>()
    expectTypeOf<
      EndEventWith<{ outcome: 'EXPIRED' | 'ASSIGNED'; pricePerShare: null }>
    >().toExtend<PmccTimelineEvent>()
    expectTypeOf<
      EndRowWith<{ outcome: 'CLOSED'; pricePerShare: string; total: string }>
    >().toExtend<PmccCycleRow>()
    expectTypeOf<
      EndRowWith<{ outcome: 'EXPIRED' | 'ASSIGNED'; pricePerShare: null; total: null }>
    >().toExtend<PmccCycleRow>()
  })

  it('rejects a short end closed without a price, or expired or assigned with one', () => {
    expectTypeOf<
      EndEventWith<{ outcome: 'CLOSED'; pricePerShare: null }>
    >().not.toExtend<PmccTimelineEvent>()
    expectTypeOf<
      EndEventWith<{ outcome: 'EXPIRED'; pricePerShare: string }>
    >().not.toExtend<PmccTimelineEvent>()
    expectTypeOf<
      EndEventWith<{ outcome: 'ASSIGNED'; pricePerShare: string }>
    >().not.toExtend<PmccTimelineEvent>()
  })

  it('rejects an end row closed without a price or total, or expired or assigned with them', () => {
    expectTypeOf<
      EndRowWith<{ outcome: 'CLOSED'; pricePerShare: null; total: null }>
    >().not.toExtend<PmccCycleRow>()
    expectTypeOf<
      EndRowWith<{ outcome: 'CLOSED'; pricePerShare: string; total: null }>
    >().not.toExtend<PmccCycleRow>()
    expectTypeOf<
      EndRowWith<{ outcome: 'EXPIRED'; pricePerShare: string; total: string }>
    >().not.toExtend<PmccCycleRow>()
    expectTypeOf<
      EndRowWith<{ outcome: 'ASSIGNED'; pricePerShare: null; total: string }>
    >().not.toExtend<PmccCycleRow>()
  })
})

type Unrecorded = Extract<PmccCycleStatus, { status: 'UNRECORDED' }>

describe('PmccCycleStatus — a short past its expiration is neither open nor ended', () => {
  it('admits an unrecorded cycle with its expiration and days held', () => {
    expectTypeOf<{
      status: 'UNRECORDED'
      expiredOn: string
      daysHeld: number
    }>().toExtend<PmccCycleStatus>()
  })

  it('gives an unrecorded cycle no DTE remaining, no days so far and no outcome', () => {
    expectTypeOf<Unrecorded>().not.toHaveProperty('dteRemaining')
    expectTypeOf<Unrecorded>().not.toHaveProperty('daysSoFar')
    expectTypeOf<Unrecorded>().not.toHaveProperty('outcome')
  })

  it('rejects an unrecorded cycle without the date it expired', () => {
    expectTypeOf<{
      status: 'UNRECORDED'
      daysSoFar: number
      dteRemaining: number
    }>().not.toExtend<PmccCycleStatus>()
  })
})

type Average = PmccTimelineSummary['average']

describe('PmccTimelineSummary — the average is both figures or neither', () => {
  it('admits a per-share and total pair, or null', () => {
    expectTypeOf<{ perShare: string; total: string }>().toExtend<Average>()
    expectTypeOf<null>().toExtend<Average>()
  })

  it('rejects half a pair', () => {
    expectTypeOf<{ perShare: string; total: null }>().not.toExtend<Average>()
    expectTypeOf<{ perShare: null; total: string }>().not.toExtend<Average>()
    expectTypeOf<{ perShare: string }>().not.toExtend<Average>()
  })
})

type Gap<Kind extends PmccGap['kind']> = Extract<PmccGap, { kind: Kind }>
type Span = { from: string; to: string; days: number }

describe('PmccGap — each kind carries the neighbours it has, and only those', () => {
  it('admits a leading, between, trailing and whole-window gap', () => {
    expectTypeOf<Span & { kind: 'LEADING'; beforeCycle: number }>().toExtend<PmccGap>()
    expectTypeOf<
      Span & { kind: 'BETWEEN'; afterCycle: number; beforeCycle: number }
    >().toExtend<PmccGap>()
    expectTypeOf<Span & { kind: 'TRAILING'; afterCycle: number }>().toExtend<PmccGap>()
    expectTypeOf<Span & { kind: 'WHOLE_WINDOW' }>().toExtend<PmccGap>()
  })

  it('gives a gap no neighbour on a side it has none', () => {
    expectTypeOf<Gap<'LEADING'>>().not.toHaveProperty('afterCycle')
    expectTypeOf<Gap<'TRAILING'>>().not.toHaveProperty('beforeCycle')
    expectTypeOf<Gap<'WHOLE_WINDOW'>>().not.toHaveProperty('afterCycle')
    expectTypeOf<Gap<'WHOLE_WINDOW'>>().not.toHaveProperty('beforeCycle')
  })

  it('rejects a gap missing a neighbour its kind has, a null neighbour, or no kind', () => {
    expectTypeOf<Span & { kind: 'LEADING' }>().not.toExtend<PmccGap>()
    expectTypeOf<Span & { kind: 'BETWEEN'; afterCycle: number }>().not.toExtend<PmccGap>()
    expectTypeOf<Span & { kind: 'TRAILING' }>().not.toExtend<PmccGap>()
    expectTypeOf<
      Span & { kind: 'BETWEEN'; afterCycle: number; beforeCycle: null }
    >().not.toExtend<PmccGap>()
    expectTypeOf<Span & { afterCycle: null; beforeCycle: number }>().not.toExtend<PmccGap>()
  })
})

type Open = PmccTimelineSummary['open']

describe('PmccTimelineSummary — the open cycles are a count and a credit, or none', () => {
  it('admits a count with its credit, or null', () => {
    expectTypeOf<{ count: number; creditPerShare: string }>().toExtend<Open>()
    expectTypeOf<null>().toExtend<Open>()
  })

  it('rejects a count without its credit, and the two separate fields', () => {
    expectTypeOf<{ count: number }>().not.toExtend<Open>()
    expectTypeOf<{ count: number; creditPerShare: null }>().not.toExtend<Open>()
    expectTypeOf<PmccTimelineSummary>().not.toHaveProperty('openCount')
    expectTypeOf<PmccTimelineSummary>().not.toHaveProperty('openCreditPerShare')
  })
})

describe('PmccTimeline and its events — no field the timeline can derive', () => {
  it('carries no LEAPS contract count', () => {
    expectTypeOf<PmccTimeline>().not.toHaveProperty('leapsContracts')
  })

  it('gives a LEAPS roll no date of its own: its closing and opening fills date it', () => {
    expectTypeOf<Extract<PmccTimelineEvent, { kind: 'LEAPS_ROLL' }>>().not.toHaveProperty('date')
  })

  it('returns null, not a throw, for a history with no LEAPS', () => {
    expectTypeOf(buildPmccTimeline).returns.toEqualTypeOf<PmccTimeline | null>()
  })
})
