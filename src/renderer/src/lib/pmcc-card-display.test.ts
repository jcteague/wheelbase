// [US-108] The PMCC card's display derivation: every figure and string on the card face,
// its signals and tier 2, from the OPT-16 fixtures on the Background valuation date.
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type { OptionSnapshot, OptionSnapshotsBySymbol } from '../api/market-data'
import type { PmccListItem } from '../api/positions'
import { toPmccListPhase } from '../../../main/pmcc-phase'
import {
  XYZ_BACKGROUND,
  XYZ_LEAPS_LEG,
  XYZ_LEAPS_ONLY,
  XYZ_LEAPS_SNAPSHOT,
  XYZ_PAID_FOR,
  XYZ_PARTIAL_COVERAGE,
  XYZ_SHORT_112_LEG,
  XYZ_SHORT_LEG,
  XYZ_SHORT_SNAPSHOT,
  XYZ_THREE_CONTRACTS,
  XYZ_TWO_SHORTS,
  optionSnapshot,
  pmccSnapshots,
  xyzQuote
} from '../test-fixtures/wheel-cards'
import {
  derivePmccCardDisplay,
  type ClosedPmccDisplay,
  type NeutralPmccDisplay,
  type OpenLeg,
  type OpenPmccDisplay,
  type PmccCardDisplayOptions,
  type Tier2Cell,
  type ValuedPmccPnl
} from './pmcc-card-display'

const NOW = new Date(2026, 10, 6, 10, 0, 0)
const OPEN: PmccCardDisplayOptions = { closed: false, now: NOW }

const BG_SNAPSHOTS = {
  'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
  'xyz-short': XYZ_SHORT_SNAPSHOT
}

function openDisplay(
  item: PmccListItem,
  byLegId: Record<string, OptionSnapshot>,
  price: string | null = '104.20',
  options: PmccCardDisplayOptions = OPEN
): OpenPmccDisplay {
  const quote = price === null ? undefined : xyzQuote(price)
  const display = derivePmccCardDisplay(item, pmccSnapshots(item, byLegId), quote, options)
  if (display.kind !== 'open') throw new Error(`expected an open display, got ${display.kind}`)
  return display
}

function background(byLegId: Record<string, OptionSnapshot> = BG_SNAPSHOTS): OpenPmccDisplay {
  return openDisplay(XYZ_BACKGROUND, byLegId)
}

function withLegs(item: PmccListItem, legs: PmccListItem['pmcc']['legs']): PmccListItem {
  return { ...item, pmcc: { ...item.pmcc, legs } }
}

function legNamed(display: OpenPmccDisplay, legId: string): OpenLeg {
  const leg = display.legs.find((l) => l.legId === legId)
  if (leg === undefined) throw new Error(`no leg ${legId}`)
  return leg
}

function cell(display: OpenPmccDisplay, label: string): Tier2Cell | undefined {
  return display.tier2.find((c) => c.label === label)
}

const BACKGROUND_BASIS = { total: '$2,120.00', sub: '$21.20 / share', paidFor: false }
const BACKGROUND_CREDITS = {
  total: '$380.00',
  sub: '15.2% of LEAPS cost recovered',
  meterFraction: 0.152,
  meterGold: false
}

describe('derivePmccCardDisplay — the card face', () => {
  it('states the position, its coverage and the next decision for the Background', () => {
    const display = background()
    expect(display).toMatchObject({
      kind: 'open',
      price: '104.20',
      priceSubline: '14d to next decision',
      state: 'LEAPS + short call open',
      coverage: '1 × 100 sh'
    })
  })

  it('renders the LEAPS block first: strike, expiration, DTE, mid, delta and debit', () => {
    const [leaps] = background().legs
    expect(leaps).toEqual({
      legId: 'xyz-leaps',
      tag: 'L',
      title: '$80.00 LEAPS',
      contractsSuffix: '',
      expiration: '2027-09-17',
      dte: '315d',
      dteGold: false,
      dteTooltip: null,
      mark: { mid: '$26.10', note: null },
      trailing: { delta: '0.82', debit: '$25.00' },
      actions: []
    })
  })

  it('renders the short-call block second with its own TARGET cue at 50.0% of max', () => {
    const short = background().legs[1]
    expect(short).toMatchObject({
      legId: 'xyz-short',
      tag: 'S',
      title: '$108.00 call',
      contractsSuffix: '',
      expiration: '2026-11-20',
      dte: '14d',
      dteGold: false,
      dteTooltip: null,
      mark: { mid: '$0.90', note: null },
      trailing: {
        percentOfMax: '50.0% of max',
        tone: 'gain',
        target: { pnlPercent: '50.0000', maxProfit: '180.0000', targetPercent: 50 }
      }
    })
  })

  it('marks the diagonal against the cost basis: (26.10 − 0.90) × 100 − 2,120.00', () => {
    const display = background()
    expect(display.pnl).toEqual({
      amount: '+$400.00',
      tone: 'gain',
      percentLine: '+18.9% of basis',
      wide: false
    })
  })

  it('shows the cost basis and the credits collected with the recovery meter', () => {
    const display = background()
    expect(display.basis).toEqual(BACKGROUND_BASIS)
    expect(display.credits).toEqual(BACKGROUND_CREDITS)
  })

  it('opens MANAGEMENT WINDOW on the 14-DTE short and marks that short alone', () => {
    const display = background()
    expect(display.signals.actions).toEqual([
      expect.objectContaining({
        statusWord: 'MANAGEMENT WINDOW',
        glyph: '◷',
        tone: 'gold',
        summary: '14 DTE remaining — review for roll or close',
        legs: [{ side: 'SHORT', legId: 'xyz-short' }]
      })
    ])
    expect(display.legs.map((leg) => leg.actions.map((a) => a.statusWord))).toEqual([
      [],
      ['MANAGEMENT WINDOW']
    ])
    expect(display.signals.awareness).toEqual([])
  })

  it('looks each leg up by its OCC call symbol', () => {
    const snapshots: OptionSnapshotsBySymbol = {
      XYZ270917C00080000: XYZ_LEAPS_SNAPSHOT,
      XYZ261120C00108000: XYZ_SHORT_SNAPSHOT
    }
    const display = derivePmccCardDisplay(XYZ_BACKGROUND, snapshots, xyzQuote('104.20'), OPEN)
    if (display.kind !== 'open') throw new Error('expected open')
    expect(display.legs.map((leg) => leg.mark)).toEqual([
      { mid: '$26.10', note: null },
      { mid: '$0.90', note: null }
    ])
  })

  it('reads the price as null with no quote', () => {
    expect(openDisplay(XYZ_BACKGROUND, BG_SNAPSHOTS, null).price).toBeNull()
  })
})

describe('derivePmccCardDisplay — net P&L sign and rounding', () => {
  it('reads a zero P&L as a gain of zero', () => {
    const display = background({
      'xyz-leaps': optionSnapshot('22.00', '22.20', '22.10', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(display.pnl).toEqual({
      amount: '+$0.00',
      tone: 'gain',
      percentLine: '+0.0% of basis',
      wide: false
    })
  })

  it('reads one cent under the basis as a loss with a negative zero percent', () => {
    const display = background({
      'xyz-leaps': optionSnapshot('22.00', '22.20', '22.0999', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(display.pnl).toEqual({
      amount: '−$0.01',
      tone: 'loss',
      percentLine: '−0.0% of basis',
      wide: false
    })
  })

  it('rounds a percent of basis ending in 5 half up (18.85 → 18.9)', () => {
    // (26.0962 − 0.90) × 100 − 2120 = 399.62; 399.62 / 2120 = 18.85%
    const display = background({
      'xyz-leaps': optionSnapshot('25.70', '26.50', '26.0962', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(display.pnl).toEqual({
      amount: '+$399.62',
      tone: 'gain',
      percentLine: '+18.9% of basis',
      wide: false
    })
  })
})

describe('derivePmccCardDisplay — the short call keeps its own profit cue', () => {
  it('reads a short below target as its share of max in the gain tone, with no TARGET', () => {
    const short = background({
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('1.15', '1.25', '1.20')
    }).legs[1]
    expect(short.trailing).toEqual({ percentOfMax: '33.3% of max', tone: 'gain', target: null })
  })

  it('reads a short marked above its fill as a negative share of max in the loss tone', () => {
    const short = background({
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('3.40', '3.60', '3.50')
    }).legs[1]
    expect(short.trailing).toEqual({ percentOfMax: '−94.4% of max', tone: 'loss', target: null })
  })

  it('reads a short marked at its fill as flat', () => {
    const short = background({
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('1.75', '1.85', '1.80')
    }).legs[1]
    expect(short.trailing).toEqual({ percentOfMax: '0.0% of max', tone: 'flat', target: null })
  })

  it('does not reach the target one cent short of it (49.4%)', () => {
    const short = background({
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('0.86', '0.96', '0.91')
    }).legs[1]
    expect(short.trailing).toEqual({ percentOfMax: '49.4% of max', tone: 'gain', target: null })
  })

  it("uses the position's profit-target override over the default", () => {
    const item = { ...XYZ_BACKGROUND, profitTargetPercent: 60 }
    const short = openDisplay(item, BG_SNAPSHOTS).legs[1]
    expect(short.trailing).toEqual({ percentOfMax: '50.0% of max', tone: 'gain', target: null })
  })

  it('uses the app default profit target when the position has no override', () => {
    const short = openDisplay(
      XYZ_BACKGROUND,
      { 'xyz-leaps': XYZ_LEAPS_SNAPSHOT, 'xyz-short': optionSnapshot('1.15', '1.25', '1.20') },
      '104.20',
      { ...OPEN, profitTargetDefault: 30 }
    ).legs[1]
    expect(short.trailing).toEqual({
      percentOfMax: '33.3% of max',
      tone: 'gain',
      target: { pnlPercent: '33.3333', maxProfit: '180.0000', targetPercent: 30 }
    })
  })
})

describe('derivePmccCardDisplay — a falling stock', () => {
  let display: OpenPmccDisplay
  beforeEach(() => {
    display = openDisplay(
      XYZ_BACKGROUND,
      {
        'xyz-leaps': optionSnapshot('16.10', '16.70', '16.40', '0.7000'),
        'xyz-short': optionSnapshot('0.15', '0.25', '0.20', '0.0500')
      },
      '92.00'
    )
  })

  it('reads a losing position', () => {
    expect(display.pnl).toEqual({
      amount: '−$500.00',
      tone: 'loss',
      percentLine: '−23.6% of basis',
      wide: false
    })
  })

  it('reads a profitable short call at 88.9% of max that has reached the target', () => {
    expect(display.legs[1].trailing).toEqual({
      percentOfMax: '88.9% of max',
      tone: 'gain',
      target: { pnlPercent: '88.8889', maxProfit: '180.0000', targetPercent: 50 }
    })
  })

  it('never states a wheel-style % of max profit for the position', () => {
    expect(JSON.stringify(display)).not.toContain('of max profit')
  })
})

describe('derivePmccCardDisplay — a wide LEAPS spread', () => {
  let display: OpenPmccDisplay
  beforeEach(() => {
    display = background({
      'xyz-leaps': optionSnapshot('24.60', '27.60', '26.10', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
  })

  it('carries the wide-spread ⚠ on the LEAPS mid', () => {
    expect(display.legs[0].mark).toEqual({
      mid: '$26.10',
      note: { kind: 'wideSpread', tooltip: 'Wide spread: $24.60 × $27.60 — P&L may be unreliable' }
    })
  })

  it('flags the still-valued P&L as unreliable', () => {
    expect(display.pnl).toEqual({
      amount: '+$400.00',
      tone: 'gain',
      percentLine: '+18.9% of basis',
      wide: true
    })
  })

  it('adds the ⚠ awareness tag and leaves the strip at MANAGEMENT WINDOW', () => {
    expect(display.signals.awareness).toEqual([
      {
        glyph: '⚠',
        name: 'Wide spread',
        tone: 'gold',
        tooltip: 'LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable'
      }
    ])
    expect(display.signals.actions.map((a) => a.statusWord)).toEqual(['MANAGEMENT WINDOW'])
  })

  it('carries wide on the valued P&L only, so an unavailable P&L cannot read wide', () => {
    expectTypeOf<ValuedPmccPnl['wide']>().toEqualTypeOf<boolean>()
    expectTypeOf<
      Exclude<OpenPmccDisplay['pnl'], ValuedPmccPnl>
    >().toEqualTypeOf<'unavailable — a leg has no mark'>()
    expectTypeOf<OpenPmccDisplay>().not.toHaveProperty('pnlWide')
  })

  it("marks nothing for the short call's own wide spread (0.85 × 0.95 is 11% of the mid)", () => {
    const tight = background()
    expect(tight.legs[1].mark).toEqual({ mid: '$0.90', note: null })
    expect(tight.pnl).toMatchObject({ wide: false })
    expect(tight.signals.awareness).toEqual([])
  })
})

describe('derivePmccCardDisplay — a missing or unusable leg snapshot', () => {
  it('leaves the LEAPS mark and the P&L unavailable, the short and the footer untouched', () => {
    const display = background({ 'xyz-short': XYZ_SHORT_SNAPSHOT })
    expect(display.legs[0].mark).toBe('unavailable')
    expect(display.legs[0].trailing).toEqual({ delta: '—', debit: '$25.00' })
    expect(display.pnl).toBe('unavailable — a leg has no mark')
    expect(display.legs[1].trailing).toEqual({
      percentOfMax: '50.0% of max',
      tone: 'gain',
      target: { pnlPercent: '50.0000', maxProfit: '180.0000', targetPercent: 50 }
    })
    expect(display.basis).toEqual(BACKGROUND_BASIS)
    expect(display.credits).toEqual(BACKGROUND_CREDITS)
  })

  it('leaves the short mark, its cue and the P&L unavailable without a short snapshot', () => {
    const display = background({ 'xyz-leaps': XYZ_LEAPS_SNAPSHOT })
    expect(display.legs[1].mark).toBe('unavailable')
    expect(display.legs[1].trailing).toBe('unavailable')
    expect(display.pnl).toBe('unavailable — a leg has no mark')
  })

  it('treats a snapshot with a non-numeric mid as no mark rather than throwing', () => {
    const display = background({
      'xyz-leaps': optionSnapshot('25.70', '26.50', 'n/a', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(display.legs[0].mark).toBe('unavailable')
    expect(display.pnl).toBe('unavailable — a leg has no mark')
  })

  it('treats a negative mid as no mark rather than throwing', () => {
    const display = background({
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('0.00', '0.10', '-0.05')
    })
    expect(display.legs[1].mark).toBe('unavailable')
    expect(display.legs[1].trailing).toBe('unavailable')
    expect(display.pnl).toBe('unavailable — a leg has no mark')
  })

  it('reads a leg whose OCC symbol cannot be built as unavailable and still returns', () => {
    const item = withLegs(XYZ_BACKGROUND, [{ ...XYZ_LEAPS_LEG, strike: '0' }, XYZ_SHORT_LEG])
    const snapshots: OptionSnapshotsBySymbol = { XYZ261120C00108000: XYZ_SHORT_SNAPSHOT }
    const display = derivePmccCardDisplay(item, snapshots, xyzQuote('104.20'), OPEN)
    if (display.kind !== 'open') throw new Error('expected open')
    expect(display.legs[0].mark).toBe('unavailable')
    expect(display.legs[1].mark).toEqual({ mid: '$0.90', note: null })
    expect(display.pnl).toBe('unavailable — a leg has no mark')
  })

  it('reads every mark unavailable when no snapshots have loaded', () => {
    const display = derivePmccCardDisplay(XYZ_BACKGROUND, undefined, xyzQuote('104.20'), OPEN)
    if (display.kind !== 'open') throw new Error('expected open')
    expect(display.legs.map((leg) => leg.mark)).toEqual(['unavailable', 'unavailable'])
  })
})

describe('derivePmccCardDisplay — missing greeks', () => {
  it('blanks the LEAPS delta and changes nothing else on the face', () => {
    const face = background()
    const noGreeks = background({
      'xyz-leaps': optionSnapshot('25.70', '26.50', '26.10'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(noGreeks.legs[0].trailing).toEqual({ delta: '—', debit: '$25.00' })
    const { legs, tier2, ...rest } = noGreeks
    const { legs: faceLegs, tier2: faceTier2, ...faceRest } = face
    expect(rest).toEqual(faceRest)
    expect({ ...legs[0], trailing: null }).toEqual({ ...faceLegs[0], trailing: null })
    expect(legs[1]).toEqual(faceLegs[1])
    const withoutDelta = (cells: Tier2Cell[]): Tier2Cell[] =>
      cells.filter((c) => c.label !== 'LEAPS delta')
    expect(withoutDelta(tier2)).toEqual(withoutDelta(faceTier2))
  })
})

describe('derivePmccCardDisplay — a PMCC with only the LEAPS open', () => {
  let display: OpenPmccDisplay
  beforeEach(() => {
    display = openDisplay(XYZ_LEAPS_ONLY, {
      'xyz-leaps': optionSnapshot('25.10', '25.70', '25.40', '0.8000')
    })
  })

  it('states a single LEAPS block and its DTE as the next decision', () => {
    expect(display).toMatchObject({
      state: 'LEAPS open · no short call',
      coverage: '1 × 100 sh',
      priceSubline: '333d to next decision'
    })
    expect(display.legs.map((leg) => leg.tag)).toEqual(['L'])
  })

  it('marks the LEAPS alone against the basis: 25.40 × 100 − 2,300.00', () => {
    expect(display.pnl).toEqual({
      amount: '+$240.00',
      tone: 'gain',
      percentLine: '+10.4% of basis',
      wide: false
    })
  })

  it('shows no profit cue anywhere', () => {
    expect(JSON.stringify(display)).not.toContain('of max')
    expect(JSON.stringify(display)).not.toContain('targetPercent')
  })

  it('reads the credits with a 0-padded percent', () => {
    expect(display.credits).toEqual({
      total: '$200.00',
      sub: '8.0% of LEAPS cost recovered',
      meterFraction: 0.08,
      meterGold: false
    })
  })

  it('has no short to be called away at or to carry extrinsic', () => {
    expect(cell(display, 'Max if called')).toEqual({
      label: 'Max if called',
      value: '—',
      note: 'no short call open'
    })
    expect(cell(display, 'Short extrinsic')).toEqual({
      label: 'Short extrinsic',
      value: '—',
      note: 'no short call open'
    })
  })

  it('opens no action state', () => {
    expect(display.signals).toEqual({ actions: [], awareness: [] })
  })
})

describe('derivePmccCardDisplay — DTE emphasis', () => {
  function legsAt(leapsDte: number, shortDte: number): OpenLeg[] {
    const item = withLegs(XYZ_BACKGROUND, [
      { ...XYZ_LEAPS_LEG, dte: leapsDte },
      { ...XYZ_SHORT_LEG, dte: shortDte }
    ])
    return openDisplay(item, BG_SNAPSHOTS).legs
  }

  const ROLL_TOOLTIP = 'Roll window — LEAPS inside the 60-day window'
  const EXPIRING_TOOLTIP = 'Expiring soon — short call inside 7 days'

  it.each([
    [-1, false, null],
    [0, true, ROLL_TOOLTIP],
    [59, true, ROLL_TOOLTIP],
    [60, true, ROLL_TOOLTIP],
    [61, false, null]
  ])('LEAPS at %i DTE is gold: %s', (dte, gold, tooltip) => {
    const [leaps] = legsAt(dte, 31)
    expect({ dte: leaps.dte, dteGold: leaps.dteGold, dteTooltip: leaps.dteTooltip }).toEqual({
      dte: `${dte}d`,
      dteGold: gold,
      dteTooltip: tooltip
    })
  })

  it.each([
    [4, true, EXPIRING_TOOLTIP],
    [7, true, EXPIRING_TOOLTIP],
    [8, false, null],
    [14, false, null]
  ])('short at %i DTE is gold: %s', (dte, gold, tooltip) => {
    const short = legsAt(315, dte)[1]
    expect({ dte: short.dte, dteGold: short.dteGold, dteTooltip: short.dteTooltip }).toEqual({
      dte: `${dte}d`,
      dteGold: gold,
      dteTooltip: tooltip
    })
  })

  it('puts ROLL WINDOW on the LEAPS block and leaves the 31-DTE short plain', () => {
    const legs = legsAt(59, 31)
    expect(legs.map((leg) => leg.actions.map((a) => a.statusWord))).toEqual([['ROLL WINDOW'], []])
    expect(legs[0].actions[0].summary).toBe(
      'LEAPS 59d left, inside the 60-day window · roll while it has time value'
    )
  })

  it('puts EXPIRING on the 4-DTE short', () => {
    const legs = legsAt(305, 4)
    expect(legs[1].actions.map((a) => a.summary)).toEqual(['Expires in 4 days at $108.00 strike'])
  })
})

describe('derivePmccCardDisplay — signal inputs', () => {
  it('opens ▲ ASSIGNMENT RISK ahead of MANAGEMENT WINDOW from the stock quote', () => {
    const display = openDisplay(XYZ_BACKGROUND, BG_SNAPSHOTS, '106.10')
    expect(display.signals.actions.map((a) => [a.statusWord, a.tone, a.summary])).toEqual([
      ['ASSIGNMENT RISK', 'gold', 'stock 1.8% below the $108.00 strike · plan the roll'],
      ['MANAGEMENT WINDOW', 'gold', '14 DTE remaining — review for roll or close']
    ])
  })

  it("closes MANAGEMENT WINDOW when the position's window is shorter than the short DTE", () => {
    const item = { ...XYZ_BACKGROUND, pmcc: { ...XYZ_BACKGROUND.pmcc, managementWindowDte: 13 } }
    expect(openDisplay(item, BG_SNAPSHOTS).signals.actions).toEqual([])
  })

  it("keeps MANAGEMENT WINDOW open at the position's window", () => {
    const item = { ...XYZ_BACKGROUND, pmcc: { ...XYZ_BACKGROUND.pmcc, managementWindowDte: 14 } }
    expect(openDisplay(item, BG_SNAPSHOTS).signals.actions.map((a) => a.statusWord)).toEqual([
      'MANAGEMENT WINDOW'
    ])
  })

  it('raises ⚑ from the next earnings date counted from the valuation date', () => {
    const item = withLegs({ ...XYZ_BACKGROUND, nextEarnings: '2026-11-18' }, [
      { ...XYZ_LEAPS_LEG, dte: 305 },
      { ...XYZ_SHORT_LEG, dte: 4 }
    ])
    const display = openDisplay(item, BG_SNAPSHOTS, '104.20', {
      ...OPEN,
      now: new Date(2026, 10, 16, 10, 0, 0)
    })
    expect(display.signals.awareness).toEqual([
      {
        glyph: '⚑',
        name: 'Earnings',
        tone: 'gold',
        tooltip: 'Earnings in 2 days before your 2026-11-20 expiration'
      }
    ])
  })

  it('raises no ⚑ the day after the short call expires', () => {
    const item = withLegs({ ...XYZ_BACKGROUND, nextEarnings: '2026-11-21' }, [
      { ...XYZ_LEAPS_LEG, dte: 305 },
      { ...XYZ_SHORT_LEG, dte: 4 }
    ])
    const display = openDisplay(item, BG_SNAPSHOTS, '104.20', {
      ...OPEN,
      now: new Date(2026, 10, 16, 10, 0, 0)
    })
    expect(display.signals.awareness).toEqual([])
  })

  it('raises δ from the LEAPS snapshot delta below the floor', () => {
    const display = background({
      'xyz-leaps': optionSnapshot('25.70', '26.50', '26.10', '0.5400'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(display.signals.awareness.map((tag) => tag.tooltip)).toEqual([
      'LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock'
    ])
    expect(display.legs[0].trailing).toEqual({ delta: '0.54', debit: '$25.00' })
  })

  it('reads a healthy card on 2026-10-26 as no strip and no tags', () => {
    const item = withLegs(XYZ_BACKGROUND, [
      { ...XYZ_LEAPS_LEG, dte: 326 },
      { ...XYZ_SHORT_LEG, dte: 25 }
    ])
    const display = openDisplay(item, {
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('1.15', '1.25', '1.20', '0.2400')
    })
    expect(display.signals).toEqual({ actions: [], awareness: [] })
    expect(display.legs.map((leg) => leg.actions)).toEqual([[], []])
  })

  it('puts ✕ and ▲ on the below-breakeven short, red first', () => {
    const item = withLegs(XYZ_BACKGROUND, [
      XYZ_LEAPS_LEG,
      {
        ...XYZ_SHORT_LEG,
        legId: 'xyz-short-99',
        strike: '99.0000',
        expiration: '2026-12-18',
        dte: 42,
        fillPerShare: '1.5500'
      }
    ])
    const display = openDisplay(
      item,
      { 'xyz-leaps': XYZ_LEAPS_SNAPSHOT, 'xyz-short-99': optionSnapshot('2.00', '2.10', '2.05') },
      '99.40'
    )
    expect(legNamed(display, 'xyz-short-99').actions.map((a) => [a.glyph, a.tone])).toEqual([
      ['✕', 'red'],
      ['▲', 'red']
    ])
    expect(display.legs[0].actions).toEqual([])
  })
})

describe('derivePmccCardDisplay — a LEAPS fully paid for by credits', () => {
  let display: OpenPmccDisplay
  beforeEach(() => {
    display = openDisplay(
      XYZ_PAID_FOR,
      {
        'xyz-leaps-85': optionSnapshot('33.10', '33.70', '33.40', '0.8800'),
        'xyz-short-120': optionSnapshot('0.90', '1.00', '0.95', '0.1500')
      },
      '118.00'
    )
  })

  it('shows the negative basis as is, in the paid-for accent', () => {
    expect(display.basis).toEqual({ total: '−$40.00', sub: 'LEAPS paid for', paidFor: true })
  })

  it('fills the meter gold past 100% recovered', () => {
    expect(display.credits).toEqual({
      total: '$2,290.00',
      sub: '101.8% of LEAPS cost recovered',
      meterFraction: 1,
      meterGold: true
    })
  })

  it('reads the P&L in dollars only once the basis is not positive', () => {
    expect(display.pnl).toEqual({
      amount: '+$3,285.00',
      tone: 'gain',
      percentLine: 'basis not positive',
      wide: false
    })
  })
})

describe('derivePmccCardDisplay — basis and meter boundaries', () => {
  function withLedger(overrides: Partial<PmccListItem['pmcc']>): OpenPmccDisplay {
    return openDisplay({ ...XYZ_BACKGROUND, pmcc: { ...XYZ_BACKGROUND.pmcc, ...overrides } }, {})
  }

  it('reads a zero basis as paid for', () => {
    expect(withLedger({ basisPerShare: '0.0000', basisTotal: '0.0000' }).basis).toEqual({
      total: '$0.00',
      sub: 'LEAPS paid for',
      paidFor: true
    })
  })

  it('reads a one-cent basis as a per-share basis', () => {
    expect(withLedger({ basisPerShare: '0.0001', basisTotal: '0.0100' }).basis).toEqual({
      total: '$0.01',
      sub: '$0.00 / share',
      paidFor: false
    })
  })

  it('turns the meter gold at exactly 100% recovered', () => {
    expect(withLedger({ premiumRecoveredPercent: '100.0000' }).credits).toMatchObject({
      sub: '100.0% of LEAPS cost recovered',
      meterFraction: 1,
      meterGold: true
    })
  })

  it('keeps the meter green just under 100% recovered', () => {
    expect(withLedger({ premiumRecoveredPercent: '99.9900' }).credits).toMatchObject({
      sub: '100.0% of LEAPS cost recovered',
      meterFraction: 0.9999,
      meterGold: false
    })
  })

  it('dashes the recovery when the LEAPS cost is not positive', () => {
    expect(withLedger({ premiumRecoveredPercent: null }).credits).toEqual({
      total: '$380.00',
      sub: '—',
      meterFraction: null,
      meterGold: false
    })
  })
})

describe('derivePmccCardDisplay — totals scale with contracts', () => {
  let display: OpenPmccDisplay
  beforeEach(() => {
    display = openDisplay(XYZ_THREE_CONTRACTS, BG_SNAPSHOTS)
  })

  it('suffixes each leg title with its contract count', () => {
    expect(display.legs.map((leg) => [leg.title, leg.contractsSuffix])).toEqual([
      ['$80.00 LEAPS', ' ×3'],
      ['$108.00 call', ' ×3']
    ])
    expect(display.coverage).toBe('3 × 100 sh')
  })

  it('scales the P&L, basis and credits totals but not the per-share figures', () => {
    expect(display.pnl).toEqual({
      amount: '+$1,200.00',
      tone: 'gain',
      percentLine: '+18.9% of basis',
      wide: false
    })
    expect(display.basis).toEqual({ total: '$6,360.00', sub: '$21.20 / share', paidFor: false })
    expect(display.credits).toMatchObject({
      total: '$1,140.00',
      sub: '15.2% of LEAPS cost recovered'
    })
  })

  it('keeps the TARGET at 50.0% of max on the three-contract short', () => {
    expect(display.legs[1].trailing).toEqual({
      percentOfMax: '50.0% of max',
      tone: 'gain',
      target: { pnlPercent: '50.0000', maxProfit: '540.0000', targetPercent: 50 }
    })
  })
})

describe('derivePmccCardDisplay — two short calls against one LEAPS', () => {
  const TWO_SHORT_SNAPSHOTS = {
    'xyz-leaps': optionSnapshot('28.10', '28.70', '28.40', '0.8200'),
    'xyz-short': optionSnapshot('1.15', '1.25', '1.20'),
    'xyz-short-112': optionSnapshot('1.00', '1.10', '1.05')
  }

  let display: OpenPmccDisplay
  beforeEach(() => {
    display = openDisplay(XYZ_TWO_SHORTS, TWO_SHORT_SNAPSHOTS, '106.80')
  })

  it('renders three leg blocks, the LEAPS then the shorts in expiration order', () => {
    expect(display).toMatchObject({
      state: 'LEAPS + 2 short calls open',
      coverage: '2 × 100 sh',
      priceSubline: '14d to next decision'
    })
    expect(display.legs.map((leg) => [leg.legId, leg.title])).toEqual([
      ['xyz-leaps', '$80.00 LEAPS'],
      ['xyz-short', '$108.00 call'],
      ['xyz-short-112', '$112.00 call']
    ])
  })

  it('gives each short its own share of max', () => {
    expect(display.legs.slice(1).map((leg) => leg.trailing)).toEqual([
      { percentOfMax: '33.3% of max', tone: 'gain', target: null },
      { percentOfMax: '22.2% of max', tone: 'gain', target: null }
    ])
  })

  it('marks every leg: 28.40 × 200 − 1.20 × 100 − 1.05 × 100 − 4,240.00', () => {
    expect(display.pnl).toEqual({
      amount: '+$1,215.00',
      tone: 'gain',
      percentLine: '+28.7% of basis',
      wide: false
    })
  })

  it('highlights only the at-risk $108.00 short', () => {
    expect(display.signals.actions.map((a) => [a.statusWord, a.legs])).toEqual([
      ['ASSIGNMENT RISK', [{ side: 'SHORT', legId: 'xyz-short' }]],
      ['MANAGEMENT WINDOW', [{ side: 'SHORT', legId: 'xyz-short' }]]
    ])
    expect(display.legs.map((leg) => leg.actions.map((a) => a.statusWord))).toEqual([
      [],
      ['ASSIGNMENT RISK', 'MANAGEMENT WINDOW'],
      []
    ])
    expect(display.signals.actions[0].summary).toBe(
      'stock 1.1% below the $108.00 strike · plan the roll'
    )
  })

  it('evaluates the nearest short first whatever order the legs arrive in', () => {
    const reversed = withLegs(XYZ_TWO_SHORTS, [
      { ...XYZ_LEAPS_LEG, contracts: 2 },
      XYZ_SHORT_112_LEG,
      XYZ_SHORT_LEG
    ])
    const actions = openDisplay(reversed, TWO_SHORT_SNAPSHOTS, '106.80').signals.actions
    expect(actions.map((a) => a.legs)).toEqual([
      [{ side: 'SHORT', legId: 'xyz-short' }],
      [{ side: 'SHORT', legId: 'xyz-short' }]
    ])
  })
})

describe('derivePmccCardDisplay — partial coverage', () => {
  it('states how many LEAPS contracts are covered and marks the uncovered ones too', () => {
    const display = openDisplay(XYZ_PARTIAL_COVERAGE, BG_SNAPSHOTS)
    expect(display.coverage).toBe('1 of 3 covered')
    expect(display.pnl).toEqual({
      amount: '+$1,380.00',
      tone: 'gain',
      percentLine: '+21.7% of basis',
      wide: false
    })
  })
})

describe('derivePmccCardDisplay — tier 2', () => {
  it('lists the seven Background cells in order', () => {
    expect(background().tier2).toEqual([
      {
        label: 'Credits collected',
        value: '$380.00',
        note: '4 short-call cycles · 15.2% of LEAPS cost'
      },
      { label: 'Breakeven', value: '$101.20', note: 'LEAPS $80.00 + basis $21.20 / share' },
      { label: 'Max if called', value: '+$680.00', note: 'called away at $108.00' },
      { label: 'LEAPS delta', value: '0.82', note: 'tracking as synthetic stock' },
      { label: 'Short extrinsic', value: '$0.90', note: 'OTM — all extrinsic' },
      { label: 'LEAPS mark', value: '$26.10', note: '$25.70 × $26.50 · 3.1% wide' },
      {
        label: 'Entry net debit',
        value: '$2,320.00',
        note: '$23.20 / share · opened 2026-04-17 · 203d ago'
      }
    ])
  })

  it('reads one cycle in the singular', () => {
    const item = { ...XYZ_BACKGROUND, pmcc: { ...XYZ_BACKGROUND.pmcc, cycles: 1 } }
    expect(cell(openDisplay(item, BG_SNAPSHOTS), 'Credits collected')?.note).toBe(
      '1 short-call cycle · 15.2% of LEAPS cost'
    )
  })

  it('shows the live assignment math in the money', () => {
    const display = openDisplay(
      XYZ_BACKGROUND,
      { 'xyz-leaps': XYZ_LEAPS_SNAPSHOT, 'xyz-short': optionSnapshot('3.40', '3.60', '3.50') },
      '111.40'
    )
    expect(cell(display, 'Short extrinsic')).toEqual({
      label: 'Short extrinsic',
      value: '$0.10',
      note: 'ITM — assignment math is live'
    })
    expect(cell(display, 'Max if called')?.value).toBe('+$680.00')
  })

  it('reads the stock exactly at the strike as in the money', () => {
    const display = openDisplay(XYZ_BACKGROUND, BG_SNAPSHOTS, '108.00')
    expect(cell(display, 'Short extrinsic')).toEqual({
      label: 'Short extrinsic',
      value: '$0.90',
      note: 'ITM — assignment math is live'
    })
  })

  it('reads the stock one cent under the strike as out of the money', () => {
    const display = openDisplay(XYZ_BACKGROUND, BG_SNAPSHOTS, '107.99')
    expect(cell(display, 'Short extrinsic')?.note).toBe('OTM — all extrinsic')
  })

  it('dashes the short extrinsic with no stock quote', () => {
    expect(cell(openDisplay(XYZ_BACKGROUND, BG_SNAPSHOTS, null), 'Short extrinsic')).toEqual({
      label: 'Short extrinsic',
      value: '—',
      note: 'no quote this poll'
    })
  })

  it('scales max if called with contracts', () => {
    const display = openDisplay(XYZ_THREE_CONTRACTS, BG_SNAPSHOTS)
    expect(cell(display, 'Max if called')?.value).toBe('+$2,040.00')
  })

  it('shows the entry debit total the list carries, not the rounded per-share × 300 ($0.65 fees → $6,961.30)', () => {
    const item: PmccListItem = {
      ...XYZ_THREE_CONTRACTS,
      pmcc: {
        ...XYZ_THREE_CONTRACTS.pmcc,
        entryDebit: { perShare: '23.2043', total: '6961.3000' }
      }
    }
    expect(cell(openDisplay(item, BG_SNAPSHOTS), 'Entry net debit')).toEqual({
      label: 'Entry net debit',
      value: '$6,961.30',
      note: '$23.20 / share · opened 2026-04-17 · 203d ago'
    })
  })

  it.each([
    ['0.5400', '0.54', 'below the 0.60 floor'],
    ['0.5999', '0.60', 'below the 0.60 floor'],
    ['0.6000', '0.60', 'tracking as synthetic stock']
  ])('reads LEAPS delta %s against the floor', (delta, value, note) => {
    const display = background({
      'xyz-leaps': optionSnapshot('25.70', '26.50', '26.10', delta),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(cell(display, 'LEAPS delta')).toEqual({ label: 'LEAPS delta', value, note })
  })

  it('flags a wide LEAPS mark as making the P&L unreliable', () => {
    const display = background({
      'xyz-leaps': optionSnapshot('24.60', '27.60', '26.10', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(cell(display, 'LEAPS mark')).toEqual({
      label: 'LEAPS mark',
      value: '$26.10',
      note: '$24.60 × $27.60 · 11.5% wide · P&L unreliable'
    })
  })

  it('dashes the delta when the snapshot has no greeks', () => {
    const display = background({
      'xyz-leaps': optionSnapshot('25.70', '26.50', '26.10'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })
    expect(cell(display, 'LEAPS delta')).toEqual({
      label: 'LEAPS delta',
      value: '—',
      note: 'no greeks this poll'
    })
  })

  it('dashes the LEAPS mark when there is no LEAPS snapshot', () => {
    expect(cell(background({ 'xyz-short': XYZ_SHORT_SNAPSHOT }), 'LEAPS mark')).toEqual({
      label: 'LEAPS mark',
      value: '—',
      note: 'no snapshot this poll'
    })
  })

  it('dashes the entry debit when an entry fill is missing', () => {
    const item: PmccListItem = {
      ...XYZ_BACKGROUND,
      pmcc: { ...XYZ_BACKGROUND.pmcc, entryDebit: null }
    }
    expect(cell(openDisplay(item, BG_SNAPSHOTS), 'Entry net debit')).toEqual({
      label: 'Entry net debit',
      value: '—',
      note: 'opened 2026-04-17 · 203d ago'
    })
  })

  describe('with the clock pinned instead of an injected now', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 10, 7, 10, 0, 0))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('counts days since opening from the current date by default', () => {
      const display = openDisplay(XYZ_BACKGROUND, BG_SNAPSHOTS, '104.20', { closed: false })
      expect(cell(display, 'Entry net debit')?.note).toBe(
        '$23.20 / share · opened 2026-04-17 · 204d ago'
      )
    })
  })
})

describe('derivePmccCardDisplay — a closed PMCC', () => {
  it('shows identity, basis and credits with every live figure dashed', () => {
    const item: PmccListItem = { ...XYZ_BACKGROUND, status: 'CLOSED' }
    const display = derivePmccCardDisplay(
      item,
      pmccSnapshots(item, BG_SNAPSHOTS),
      xyzQuote('104.20'),
      { closed: true, now: NOW }
    )
    expect(display).toEqual({
      kind: 'closed',
      price: null,
      priceSubline: 'closed',
      state: 'Closed',
      coverage: '1 × 100 sh',
      legs: [
        {
          legId: 'xyz-leaps',
          tag: 'L',
          title: '$80.00 LEAPS',
          contractsSuffix: '',
          expiration: '2027-09-17',
          dte: '—',
          mark: '—'
        },
        {
          legId: 'xyz-short',
          tag: 'S',
          title: '$108.00 call',
          contractsSuffix: '',
          expiration: '2026-11-20',
          dte: '—',
          mark: '—'
        }
      ],
      pnl: 'closed — no live marks',
      basis: BACKGROUND_BASIS,
      credits: BACKGROUND_CREDITS
    })
  })

  it('cannot carry signals or tier 2 by type', () => {
    expectTypeOf<ClosedPmccDisplay>().not.toHaveProperty('signals')
    expectTypeOf<ClosedPmccDisplay>().not.toHaveProperty('tier2')
  })
})

describe('derivePmccCardDisplay — a PMCC phase this card does not know', () => {
  // A later story's phase reaches the renderer as data first.
  let UNKNOWN: PmccListItem
  beforeEach(() => {
    UNKNOWN = { ...XYZ_BACKGROUND, phase: toPmccListPhase('PMCC_ASSIGNED') }
  })

  it('renders the neutral card with the raw phase label and dashed figures', () => {
    const display = derivePmccCardDisplay(
      UNKNOWN,
      pmccSnapshots(UNKNOWN, BG_SNAPSHOTS),
      xyzQuote('106.10'),
      OPEN
    )
    expect(display).toEqual({
      kind: 'neutral',
      stateLabel: 'PMCC_ASSIGNED',
      price: null,
      priceSubline: '—',
      coverage: '1 × 100 sh',
      legs: [
        expect.objectContaining({ legId: 'xyz-leaps', dte: '—', mark: '—' }),
        expect.objectContaining({ legId: 'xyz-short', dte: '—', mark: '—' })
      ],
      pnl: '—',
      basis: BACKGROUND_BASIS,
      credits: BACKGROUND_CREDITS
    })
  })

  it('renders closed, not neutral, once the position is closed', () => {
    const display = derivePmccCardDisplay(UNKNOWN, undefined, undefined, {
      closed: true,
      now: NOW
    })
    expect(display.kind).toBe('closed')
  })

  it('cannot carry signals or tier 2 by type', () => {
    expectTypeOf<NeutralPmccDisplay>().not.toHaveProperty('signals')
    expectTypeOf<NeutralPmccDisplay>().not.toHaveProperty('tier2')
  })
})
