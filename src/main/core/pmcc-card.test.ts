// [US-108] PMCC position card: the tier-2 cues and the signal registry that ranks the
// card's action states and lists its awareness tags.
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import {
  evaluatePmccSignals,
  pmccBreakeven,
  pmccMaxIfCalled,
  premiumRecoveredFraction,
  shortExtrinsic,
  type PmccAction,
  type PmccLegRef,
  type PmccSignalDefinition,
  type PmccSignalInput,
  type PmccSignalShort,
  type PmccStatusWord,
  type PmccTag,
  type PmccTagGlyph
} from './pmcc-card'

// OPT-16 Background: $80 LEAPS, $108 short at 14 DTE, basis $21.20 → breakeven $101.20.
const short = (overrides: Partial<PmccSignalShort> = {}): PmccSignalShort => ({
  legId: 'short-108',
  strike: '108.0000',
  dte: 14,
  expiration: '2026-11-20',
  ...overrides
})

const TIGHT_LEAPS_SPREAD = { bid: '25.7000', ask: '26.5000', mid: '26.1000' } // 3.1 %
const WIDE_LEAPS_SPREAD = { bid: '24.6000', ask: '27.6000', mid: '26.1000' } // 11.5 %

/** The healthy Background: nothing fires. */
const healthy = (): PmccSignalInput => ({
  leaps: { strike: '80.0000', dte: 326, delta: '0.8200', spread: TIGHT_LEAPS_SPREAD },
  shorts: [short({ dte: 25, expiration: '2026-12-01' })],
  price: '104.2000',
  basisPerShare: '21.2000',
  managementWindowDte: 21,
  daysToEarnings: null
})

const withLeaps = (
  input: PmccSignalInput,
  leaps: Partial<PmccSignalInput['leaps']>
): PmccSignalInput => ({ ...input, leaps: { ...input.leaps, ...leaps } })

const withShort = (
  input: PmccSignalInput,
  overrides: Partial<PmccSignalShort>
): PmccSignalInput => ({
  ...input,
  shorts: [short(overrides)]
})

const statusWords = (input: PmccSignalInput): PmccStatusWord[] =>
  evaluatePmccSignals(input).actions.map((a) => a.statusWord)

const actionFor = (input: PmccSignalInput, word: PmccStatusWord): PmccAction | undefined =>
  evaluatePmccSignals(input).actions.find((a) => a.statusWord === word)

const tagGlyphs = (input: PmccSignalInput): PmccTagGlyph[] =>
  evaluatePmccSignals(input).awareness.map((t) => t.glyph)

const tagFor = (input: PmccSignalInput, glyph: PmccTagGlyph): PmccTag | undefined =>
  evaluatePmccSignals(input).awareness.find((t) => t.glyph === glyph)

describe('PMCC card cues', () => {
  it('breakeven is the LEAPS strike plus the basis per share', () => {
    expect(pmccBreakeven('80.0000', '21.2000')).toBe('101.2000')
  })

  it('breakeven sits below the LEAPS strike once the basis is negative', () => {
    expect(pmccBreakeven('85.0000', '-0.4000')).toBe('84.6000')
  })

  it('max if called is (short strike − LEAPS strike − basis) × 100 per short contract', () => {
    expect(
      pmccMaxIfCalled({
        shortStrike: '108',
        leapsStrike: '80',
        basisPerShare: '21.2',
        shortContracts: 1
      })
    ).toBe('680.0000')
  })

  it('max if called scales with the short contracts', () => {
    expect(
      pmccMaxIfCalled({
        shortStrike: '108',
        leapsStrike: '80',
        basisPerShare: '21.2',
        shortContracts: 3
      })
    ).toBe('2040.0000')
  })

  it('max if called is a loss when the short strike sits under breakeven', () => {
    expect(
      pmccMaxIfCalled({
        shortStrike: '99',
        leapsStrike: '80',
        basisPerShare: '21.2',
        shortContracts: 1
      })
    ).toBe('-220.0000')
  })

  it('an OTM short is all extrinsic', () => {
    expect(shortExtrinsic({ mid: '0.90', price: '104.20', strike: '108' })).toBe('0.9000')
  })

  it('an ITM short subtracts its intrinsic value', () => {
    expect(shortExtrinsic({ mid: '3.50', price: '111.40', strike: '108' })).toBe('0.1000')
  })

  it('an at-the-money short is all extrinsic', () => {
    expect(shortExtrinsic({ mid: '2.10', price: '108.00', strike: '108' })).toBe('2.1000')
  })

  it('short extrinsic is null without a mid', () => {
    expect(shortExtrinsic({ mid: null, price: '104.20', strike: '108' })).toBeNull()
  })

  it('short extrinsic is null without a stock price', () => {
    expect(shortExtrinsic({ mid: '0.90', price: null, strike: '108' })).toBeNull()
  })

  it.each([
    ['15.2000', 0.152],
    ['0.0000', 0],
    ['100.0000', 1],
    ['101.8000', 1],
    ['-5.0000', 0]
  ])('premium recovered %s percent fills the meter to %s', (percent, fraction) => {
    expect(premiumRecoveredFraction(percent)).toBe(fraction)
  })

  it('premium recovered is null when the ledger has no percent', () => {
    expect(premiumRecoveredFraction(null)).toBeNull()
  })
})

describe('PMCC signals — ROLL_WINDOW', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = healthy()
  })

  it('marks the LEAPS gold in lane 3 inside the 60-day window', () => {
    expect(actionFor(withLeaps(input, { dte: 59 }), 'ROLL WINDOW')).toEqual({
      glyph: '◆',
      statusWord: 'ROLL WINDOW',
      tone: 'gold',
      rank: 3,
      summary: 'LEAPS 59d left, inside the 60-day window · roll while it has time value',
      tooltip: 'LEAPS inside the 60-day roll window',
      legs: [{ side: 'LONG' }]
    })
  })

  it.each([
    [60, ['ROLL WINDOW']],
    [61, []],
    [0, ['ROLL WINDOW']],
    [-1, []]
  ])('LEAPS dte %d → %j', (dte, words) => {
    expect(statusWords(withLeaps(input, { dte }))).toEqual(words)
  })
})

describe('PMCC signals — ASSIGNMENT_RISK', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = healthy()
  })

  it('fires gold in lane 2 at exactly 2.0% below the strike', () => {
    expect(actionFor({ ...input, price: '105.8400' }, 'ASSIGNMENT RISK')).toMatchObject({
      tone: 'gold',
      rank: 2
    })
  })

  it.each(['105.8399', '105.7300'])(
    'does not fire at %s, just beyond 2.0% below a 108.00 strike',
    (price) => {
      expect(statusWords({ ...input, price })).toEqual([])
    }
  )

  it('fires red in lane 1 at the money', () => {
    expect(actionFor({ ...input, price: '108.0000' }, 'ASSIGNMENT RISK')).toMatchObject({
      tone: 'red',
      rank: 1,
      summary: 'stock 0.0% above the $108.00 strike · roll or close',
      tooltip: 'Stock is 0.0% above the short-call strike — in the money, LEAPS would have to cover'
    })
  })

  it('reads 1.8% below as a gold plan-the-roll state', () => {
    expect(actionFor({ ...input, price: '106.1000' }, 'ASSIGNMENT RISK')).toEqual({
      glyph: '▲',
      statusWord: 'ASSIGNMENT RISK',
      tone: 'gold',
      rank: 2,
      summary: 'stock 1.8% below the $108.00 strike · plan the roll',
      tooltip: 'Stock is 1.8% below the short-call strike — approaching assignment',
      legs: [{ side: 'SHORT', legId: 'short-108' }]
    })
  })

  it('reads 3.1% above as a red roll-or-close state', () => {
    expect(actionFor({ ...input, price: '111.4000' }, 'ASSIGNMENT RISK')).toEqual({
      glyph: '▲',
      statusWord: 'ASSIGNMENT RISK',
      tone: 'red',
      rank: 1,
      summary: 'stock 3.1% above the $108.00 strike · roll or close',
      tooltip:
        'Stock is 3.1% above the short-call strike — in the money, LEAPS would have to cover',
      legs: [{ side: 'SHORT', legId: 'short-108' }]
    })
  })

  it('never fires without a stock price', () => {
    expect(statusWords({ ...input, price: null })).toEqual([])
  })

  it('with two shorts only the at-risk short is the leg', () => {
    const twoShorts: PmccSignalInput = {
      ...input,
      price: '106.8000',
      shorts: [
        short({ legId: 'short-108', strike: '108.0000', dte: 14 }),
        short({ legId: 'short-112', strike: '112.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    const risks = evaluatePmccSignals(twoShorts).actions.filter(
      (a) => a.statusWord === 'ASSIGNMENT RISK'
    )
    expect(risks.map((a) => a.legs)).toEqual([[{ side: 'SHORT', legId: 'short-108' }]])
  })

  it('marks a later short when the nearest one is not at risk', () => {
    const laterAtRisk: PmccSignalInput = {
      ...input,
      price: '106.8000',
      shorts: [
        short({ legId: 'short-112', strike: '112.0000', dte: 25 }),
        short({ legId: 'short-108', strike: '108.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(laterAtRisk, 'ASSIGNMENT RISK')?.legs).toEqual([
      { side: 'SHORT', legId: 'short-108' }
    ])
  })

  it('marks the lowest-dte short when two are at risk', () => {
    const bothAtRisk: PmccSignalInput = {
      ...input,
      price: '106.8000',
      shorts: [
        short({ legId: 'short-108', strike: '108.0000', dte: 25 }),
        short({ legId: 'short-107', strike: '107.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(bothAtRisk, 'ASSIGNMENT RISK')?.legs).toEqual([
      { side: 'SHORT', legId: 'short-108' }
    ])
  })

  it('marks a red short behind a gold one: the stock above a strike beats approaching one', () => {
    const redBehindGold: PmccSignalInput = {
      ...input,
      price: '106.8000',
      shorts: [
        short({ legId: 'short-108', strike: '108.0000', dte: 14 }),
        short({ legId: 'short-105', strike: '105.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(redBehindGold, 'ASSIGNMENT RISK')).toEqual({
      glyph: '▲',
      statusWord: 'ASSIGNMENT RISK',
      tone: 'red',
      rank: 1,
      summary: 'stock 1.7% above the $105.00 strike · roll or close',
      tooltip:
        'Stock is 1.7% above the short-call strike — in the money, LEAPS would have to cover',
      legs: [{ side: 'SHORT', legId: 'short-105' }]
    })
  })

  it('marks the lowest-dte short when two are red', () => {
    const bothRed: PmccSignalInput = {
      ...input,
      price: '112.0000',
      shorts: [
        short({ legId: 'short-110', strike: '110.0000', dte: 25 }),
        short({ legId: 'short-108', strike: '108.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(bothRed, 'ASSIGNMENT RISK')?.legs).toEqual([
      { side: 'SHORT', legId: 'short-110' }
    ])
  })
})

describe('PMCC signals — BELOW_BREAKEVEN', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    // Price far below every strike so ASSIGNMENT_RISK stays quiet.
    input = { ...healthy(), price: '90.0000' }
  })

  it('marks a $99 short red in lane 0 under a $101.20 breakeven', () => {
    expect(
      actionFor(
        withShort(input, { legId: 'short-99', strike: '99.0000', dte: 42 }),
        'BELOW BREAKEVEN'
      )
    ).toEqual({
      glyph: '✕',
      statusWord: 'BELOW BREAKEVEN',
      tone: 'red',
      rank: 0,
      summary: '$99.00 strike is $2.20 under the $101.20 breakeven · roll up before it is called',
      tooltip: 'Short strike below breakeven $101.20 — being called away locks in a loss',
      legs: [{ side: 'SHORT', legId: 'short-99' }]
    })
  })

  it.each([
    ['101.1900', ['BELOW BREAKEVEN']],
    ['101.2000', []],
    ['101.2100', []]
  ])('short strike %s against a $101.20 breakeven → %j', (strike, words) => {
    expect(statusWords(withShort(input, { strike, dte: 42 }))).toEqual(words)
  })

  it('marks the short under breakeven when another short is above it', () => {
    const mixed: PmccSignalInput = {
      ...input,
      shorts: [
        short({ legId: 'short-108', strike: '108.0000', dte: 25 }),
        short({ legId: 'short-99', strike: '99.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(mixed, 'BELOW BREAKEVEN')?.legs).toEqual([
      { side: 'SHORT', legId: 'short-99' }
    ])
  })

  it('marks every short under breakeven and cites the lowest strike, the largest gap', () => {
    const twoBelow: PmccSignalInput = {
      ...input,
      shorts: [
        short({ legId: 'short-100', strike: '100.0000', dte: 25 }),
        short({ legId: 'short-108', strike: '108.0000', dte: 30, expiration: '2026-12-06' }),
        short({ legId: 'short-97', strike: '97.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(twoBelow, 'BELOW BREAKEVEN')).toEqual({
      glyph: '✕',
      statusWord: 'BELOW BREAKEVEN',
      tone: 'red',
      rank: 0,
      summary: '$97.00 strike is $4.20 under the $101.20 breakeven · roll up before it is called',
      tooltip: 'Short strike below breakeven $101.20 — being called away locks in a loss',
      legs: [
        { side: 'SHORT', legId: 'short-100' },
        { side: 'SHORT', legId: 'short-97' }
      ]
    })
  })

  it('cites the lowest strike when it is the nearest short', () => {
    const lowestFirst: PmccSignalInput = {
      ...input,
      shorts: [
        short({ legId: 'short-97', strike: '97.0000', dte: 25 }),
        short({ legId: 'short-100', strike: '100.0000', dte: 42, expiration: '2026-12-18' })
      ]
    }
    expect(actionFor(lowestFirst, 'BELOW BREAKEVEN')?.summary).toBe(
      '$97.00 strike is $4.20 under the $101.20 breakeven · roll up before it is called'
    )
  })
})

describe('PMCC signals — EXPIRING and MANAGEMENT_WINDOW', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = healthy()
  })

  it('EXPIRING marks the nearest short gold in lane 4 with the queue summary', () => {
    expect(actionFor(withShort(input, { dte: 4 }), 'EXPIRING')).toEqual({
      glyph: '◷',
      statusWord: 'EXPIRING',
      tone: 'gold',
      rank: 4,
      summary: 'Expires in 4 days at $108.00 strike',
      tooltip: 'Expires in 4 days at $108.00 strike',
      legs: [{ side: 'SHORT', legId: 'short-108' }]
    })
  })

  it('MANAGEMENT_WINDOW marks the nearest short gold in lane 5 with the queue summary', () => {
    expect(actionFor(withShort(input, { dte: 14 }), 'MANAGEMENT WINDOW')).toEqual({
      glyph: '◷',
      statusWord: 'MANAGEMENT WINDOW',
      tone: 'gold',
      rank: 5,
      summary: '14 DTE remaining — review for roll or close',
      tooltip: '14 DTE remaining — review for roll or close',
      legs: [{ side: 'SHORT', legId: 'short-108' }]
    })
  })

  it.each([
    [-1, []],
    [0, ['EXPIRING']],
    [5, ['EXPIRING']],
    [6, ['MANAGEMENT WINDOW']],
    [21, ['MANAGEMENT WINDOW']],
    [22, []]
  ])('short dte %d with the 21-day window → %j', (dte, words) => {
    expect(statusWords(withShort(input, { dte }))).toEqual(words)
  })

  it.each([
    [13, ['MANAGEMENT WINDOW']],
    [14, ['MANAGEMENT WINDOW']],
    [15, []]
  ])('short dte %d with a 14-day window → %j', (dte, words) => {
    expect(statusWords({ ...withShort(input, { dte }), managementWindowDte: 14 })).toEqual(words)
  })

  it('reads only the nearest short', () => {
    const twoShorts: PmccSignalInput = {
      ...input,
      shorts: [
        short({ legId: 'short-108', dte: 4 }),
        short({ legId: 'short-112', strike: '112.0000', dte: 14, expiration: '2026-11-20' })
      ]
    }
    expect(evaluatePmccSignals(twoShorts).actions.map((a) => [a.statusWord, a.legs])).toEqual([
      ['EXPIRING', [{ side: 'SHORT', legId: 'short-108' }]]
    ])
  })

  it('neither fires with no short call open', () => {
    expect(evaluatePmccSignals({ ...input, shorts: [] }).actions).toEqual([])
  })
})

describe('PMCC signals — EARNINGS', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = withShort(healthy(), { dte: 25, expiration: '2026-12-01' })
  })

  it('tags ⚑ with the earnings-proximity summary for the nearest short', () => {
    const background = withShort(healthy(), { dte: 14, expiration: '2026-11-20' })
    expect(tagFor({ ...background, daysToEarnings: 2 }, '⚑')).toEqual({
      glyph: '⚑',
      name: 'Earnings',
      tone: 'gold',
      tooltip: 'Earnings in 2 days before your 2026-11-20 expiration'
    })
  })

  it.each([
    [-1, []],
    [0, ['⚑']],
    [10, ['⚑']],
    [11, []]
  ])('earnings in %d days before a 25-DTE short → %j', (daysToEarnings, glyphs) => {
    expect(tagGlyphs({ ...input, daysToEarnings })).toEqual(glyphs)
  })

  it.each([
    [2, ['⚑']],
    [4, ['⚑']],
    [5, []]
  ])('earnings in %d days against a 4-DTE short → %j', (daysToEarnings, glyphs) => {
    expect(tagGlyphs({ ...withShort(input, { dte: 4 }), daysToEarnings })).toEqual(glyphs)
  })

  it('does not tag without an earnings date', () => {
    expect(tagGlyphs({ ...input, daysToEarnings: null })).toEqual([])
  })

  it('does not tag with no short call open', () => {
    expect(tagGlyphs({ ...input, shorts: [], daysToEarnings: 2 })).toEqual([])
  })
})

describe('PMCC signals — DELTA_FLOOR', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = healthy()
  })

  it('tags δ with the delta and the floor to two places', () => {
    expect(tagFor(withLeaps(input, { delta: '0.5400' }), 'δ')).toEqual({
      glyph: 'δ',
      name: 'Delta floor',
      tone: 'gold',
      tooltip: 'LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock'
    })
  })

  it.each([
    ['0.5900', ['δ']],
    ['0.6000', []],
    ['0.6100', []],
    [null, []]
  ])('LEAPS delta %s → %j', (delta, glyphs) => {
    expect(tagGlyphs(withLeaps(input, { delta }))).toEqual(glyphs)
  })
})

describe('PMCC signals — WIDE_SPREAD', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = healthy()
  })

  it('tags ⚠ with the LEAPS spread as a percent of the mid', () => {
    expect(tagFor(withLeaps(input, { spread: WIDE_LEAPS_SPREAD }), '⚠')).toEqual({
      glyph: '⚠',
      name: 'Wide spread',
      tone: 'gold',
      tooltip: 'LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable'
    })
  })

  it.each([
    ['11.5 %', WIDE_LEAPS_SPREAD, ['⚠']],
    ['10.1 %', { bid: '9.4950', ask: '10.5050', mid: '10.0000' }, ['⚠']],
    ['10.0 %', { bid: '9.5000', ask: '10.5000', mid: '10.0000' }, []],
    ['3.1 %', TIGHT_LEAPS_SPREAD, []],
    ['no snapshot', null, []]
  ])('LEAPS spread %s → %j', (_label, spread, glyphs) => {
    expect(tagGlyphs(withLeaps(input, { spread }))).toEqual(glyphs)
  })
})

describe('evaluatePmccSignals — composition', () => {
  let input: PmccSignalInput
  beforeEach(() => {
    input = healthy()
  })

  // Every pair of action states that can fire together. ▲ red / ▲ gold are one action, and
  // EXPIRING / MANAGEMENT WINDOW are exclusive by their DTE ranges, so neither pair appears.
  // $99 sits under the $101.20 breakeven; $90 is far from every strike, so ▲ stays quiet.
  const UNDER_BREAKEVEN = { legId: 'short-99', strike: '99.0000' }
  const LEAPS_IN_ROLL_WINDOW = {
    leaps: { strike: '80.0000', dte: 59, delta: '0.8200', spread: TIGHT_LEAPS_SPREAD }
  }
  it.each<[string, Partial<PmccSignalShort>, Partial<PmccSignalInput>, string[]]>([
    [
      '✕ + ▲ red',
      { ...UNDER_BREAKEVEN, dte: 42 },
      { price: '99.4000' },
      ['✕ BELOW BREAKEVEN red', '▲ ASSIGNMENT RISK red']
    ],
    [
      '✕ + ▲ gold',
      { ...UNDER_BREAKEVEN, dte: 42 },
      { price: '97.5000' },
      ['✕ BELOW BREAKEVEN red', '▲ ASSIGNMENT RISK gold']
    ],
    [
      '✕ + ◆',
      { ...UNDER_BREAKEVEN, dte: 42 },
      { price: '90.0000', ...LEAPS_IN_ROLL_WINDOW },
      ['✕ BELOW BREAKEVEN red', '◆ ROLL WINDOW gold']
    ],
    [
      '✕ + EXPIRING',
      { ...UNDER_BREAKEVEN, dte: 4 },
      { price: '90.0000' },
      ['✕ BELOW BREAKEVEN red', '◷ EXPIRING gold']
    ],
    [
      '✕ + MW',
      { ...UNDER_BREAKEVEN, dte: 14 },
      { price: '90.0000' },
      ['✕ BELOW BREAKEVEN red', '◷ MANAGEMENT WINDOW gold']
    ],
    [
      '▲ red + ◆',
      { dte: 42 },
      { price: '111.4000', ...LEAPS_IN_ROLL_WINDOW },
      ['▲ ASSIGNMENT RISK red', '◆ ROLL WINDOW gold']
    ],
    [
      '▲ red + EXPIRING',
      { dte: 4 },
      { price: '111.4000' },
      ['▲ ASSIGNMENT RISK red', '◷ EXPIRING gold']
    ],
    [
      '▲ red + MW',
      { dte: 14 },
      { price: '111.4000' },
      ['▲ ASSIGNMENT RISK red', '◷ MANAGEMENT WINDOW gold']
    ],
    [
      '▲ gold + ◆',
      { dte: 42 },
      { price: '106.1000', ...LEAPS_IN_ROLL_WINDOW },
      ['▲ ASSIGNMENT RISK gold', '◆ ROLL WINDOW gold']
    ],
    [
      '▲ gold + EXPIRING',
      { dte: 4 },
      { price: '106.1000' },
      ['▲ ASSIGNMENT RISK gold', '◷ EXPIRING gold']
    ],
    [
      '▲ gold + MW',
      { dte: 14 },
      { price: '106.1000' },
      ['▲ ASSIGNMENT RISK gold', '◷ MANAGEMENT WINDOW gold']
    ],
    ['◆ + EXPIRING', { dte: 4 }, LEAPS_IN_ROLL_WINDOW, ['◆ ROLL WINDOW gold', '◷ EXPIRING gold']],
    [
      '◆ + MW',
      { dte: 14 },
      LEAPS_IN_ROLL_WINDOW,
      ['◆ ROLL WINDOW gold', '◷ MANAGEMENT WINDOW gold']
    ],
    [
      '✕ + ▲ + MW',
      { ...UNDER_BREAKEVEN, dte: 14 },
      { price: '99.4000' },
      ['✕ BELOW BREAKEVEN red', '▲ ASSIGNMENT RISK red', '◷ MANAGEMENT WINDOW gold']
    ]
  ])('%s ranks the actions worst first', (_label, shortOverrides, overrides, expected) => {
    const actions = evaluatePmccSignals({
      ...withShort(input, shortOverrides),
      ...overrides
    }).actions
    expect(actions.map((a) => `${a.glyph} ${a.statusWord} ${a.tone}`)).toEqual(expected)
  })

  it('keeps the awareness tags in ⚑ δ ⚠ order when all three fire', () => {
    const all = {
      ...withLeaps(input, { delta: '0.5400', spread: WIDE_LEAPS_SPREAD }),
      daysToEarnings: 7
    }
    expect(tagGlyphs(all)).toEqual(['⚑', 'δ', '⚠'])
  })

  it('awareness tags alone produce no action', () => {
    const awarenessOnly = { ...withLeaps(input, { spread: WIDE_LEAPS_SPREAD }), daysToEarnings: 7 }
    expect(evaluatePmccSignals(awarenessOnly)).toEqual({
      actions: [],
      awareness: [
        {
          glyph: '⚑',
          name: 'Earnings',
          tone: 'gold',
          tooltip: 'Earnings in 7 days before your 2026-12-01 expiration'
        },
        {
          glyph: '⚠',
          name: 'Wide spread',
          tone: 'gold',
          tooltip: 'LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable'
        }
      ]
    })
  })

  it('the healthy Background has no actions and no tags', () => {
    expect(evaluatePmccSignals(input)).toEqual({ actions: [], awareness: [] })
  })

  it('no signal code is both an action and an awareness tag', () => {
    type Action = Extract<PmccSignalDefinition, { tier: 'action' }>
    type Awareness = Extract<PmccSignalDefinition, { tier: 'awareness' }>
    expectTypeOf<Extract<Action['code'], Awareness['code']>>().toBeNever()
  })

  it('an action cannot mark no leg', () => {
    expectTypeOf<[]>().not.toExtend<PmccAction['legs']>()
    expectTypeOf<[PmccLegRef]>().toExtend<PmccAction['legs']>()
  })

  it('an awareness definition cannot carry a lane, a leg or a status word', () => {
    type Awareness = Extract<PmccSignalDefinition, { tier: 'awareness' }>
    expectTypeOf<Awareness>().not.toHaveProperty('rank')
    expectTypeOf<Awareness>().not.toHaveProperty('legs')
    expectTypeOf<Awareness>().not.toHaveProperty('statusWord')
  })
})
