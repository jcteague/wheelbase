import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  actionsByPosition,
  formatActionLine,
  rankWheelActions,
  type CardAction,
  type QueueRowForCard
} from './card-actions'

const OTM_CTX = { price: '421.50', strike: '430.0000' }

const MANAGEMENT_WINDOW: QueueRowForCard = {
  ruleCode: 'MANAGEMENT_WINDOW',
  summary: '10 DTE remaining — review for roll or close'
}
const EXPIRATION_IMMINENT: QueueRowForCard = {
  ruleCode: 'EXPIRATION_IMMINENT',
  summary: 'Expires in 4 days at $430.00 strike'
}
const COVERED_CALL_BREACH: QueueRowForCard = {
  ruleCode: 'COVERED_CALL_BREACH',
  summary: 'Stock is 1.2% above the $430.00 call strike — shares may be called away'
}
const STRIKE_PROXIMITY: QueueRowForCard = {
  ruleCode: 'STRIKE_PROXIMITY',
  summary: 'Stock is 0.8% above the $180.00 put strike'
}

describe('rankWheelActions — lane per rule code', () => {
  it('maps MANAGEMENT_WINDOW to a gold ◷ MANAGEMENT WINDOW action at rank 5', () => {
    expect(rankWheelActions([MANAGEMENT_WINDOW], OTM_CTX)).toEqual([
      {
        glyph: '◷',
        statusWord: 'MANAGEMENT WINDOW',
        tone: 'gold',
        rank: 5,
        summary: '10 DTE remaining — review for roll or close'
      }
    ])
  })

  it('maps EXPIRATION_IMMINENT to a gold ◷ EXPIRING action at rank 4', () => {
    expect(rankWheelActions([EXPIRATION_IMMINENT], OTM_CTX)).toEqual([
      {
        glyph: '◷',
        statusWord: 'EXPIRING',
        tone: 'gold',
        rank: 4,
        summary: 'Expires in 4 days at $430.00 strike'
      }
    ])
  })

  it('maps COVERED_CALL_BREACH to a red ▲ CALL BREACHED action at rank 1', () => {
    expect(rankWheelActions([COVERED_CALL_BREACH], OTM_CTX)).toEqual([
      {
        glyph: '▲',
        statusWord: 'CALL BREACHED',
        tone: 'red',
        rank: 1,
        summary: 'Stock is 1.2% above the $430.00 call strike — shares may be called away'
      }
    ])
  })
})

describe('rankWheelActions — STRIKE_PROXIMITY tone and text follow the live price', () => {
  it.each([
    {
      label: 'well above the strike',
      price: '181.4000',
      tone: 'gold',
      rank: 2,
      summary: 'Stock is 0.8% above the $180.00 put strike'
    },
    {
      label: 'just above the strike',
      price: '180.0001',
      tone: 'gold',
      rank: 2,
      summary: 'Stock is 0.0% above the $180.00 put strike'
    },
    {
      label: 'equal to the strike',
      price: '180.0000',
      tone: 'gold',
      rank: 2,
      summary: 'Stock is 0.0% above the $180.00 put strike'
    },
    {
      label: 'just below the strike',
      price: '179.9999',
      tone: 'red',
      rank: 1,
      summary: 'Stock is 0.0% below the $180.00 put strike — now in the money'
    },
    {
      label: 'well below the strike',
      price: '178.9000',
      tone: 'red',
      rank: 1,
      summary: 'Stock is 0.6% below the $180.00 put strike — now in the money'
    },
    {
      label: 'below the strike numerically, not lexically',
      price: '99.5000',
      tone: 'red',
      rank: 1,
      summary: 'Stock is 44.7% below the $180.00 put strike — now in the money'
    }
  ] as const)('price $price ($label) → $tone rank $rank', ({ price, tone, rank, summary }) => {
    expect(rankWheelActions([STRIKE_PROXIMITY], { price, strike: '180.0000' })).toEqual([
      { glyph: '▲', statusWord: 'STRIKE PROXIMITY', tone, rank, summary }
    ])
  })

  it('reads in the money in red when the stored summary still says above the strike', () => {
    // Stored at the last evaluation ($181.40); the live quote has since crossed below.
    expect(rankWheelActions([STRIKE_PROXIMITY], { price: '178.9000', strike: '180.0000' })).toEqual(
      [
        expect.objectContaining({
          tone: 'red',
          summary: 'Stock is 0.6% below the $180.00 put strike — now in the money'
        })
      ]
    )
  })

  it.each([
    { label: 'price is unknown', ctx: { price: null, strike: '180.0000' } },
    { label: 'strike is unknown', ctx: { price: '178.9000', strike: null } },
    { label: 'price is not a number', ctx: { price: 'n/a', strike: '180.0000' } },
    { label: 'strike is not a number', ctx: { price: '178.9000', strike: '' } }
  ])('falls back to gold rank 2 and the stored summary when the $label', ({ ctx }) => {
    expect(rankWheelActions([STRIKE_PROXIMITY], ctx)).toEqual([
      {
        glyph: '▲',
        statusWord: 'STRIKE PROXIMITY',
        tone: 'gold',
        rank: 2,
        summary: 'Stock is 0.8% above the $180.00 put strike'
      }
    ])
  })

  it.each([MANAGEMENT_WINDOW, EXPIRATION_IMMINENT, COVERED_CALL_BREACH])(
    'keeps the stored $ruleCode summary verbatim beside a live price below the strike',
    (row) => {
      expect(rankWheelActions([row], { price: '178.9000', strike: '180.0000' })).toEqual([
        expect.objectContaining({ summary: row.summary })
      ])
    }
  )
})

describe('rankWheelActions — ordering', () => {
  it('sorts actions by rank ascending', () => {
    const actions = rankWheelActions(
      [MANAGEMENT_WINDOW, EXPIRATION_IMMINENT, COVERED_CALL_BREACH],
      OTM_CTX
    )

    expect(actions.map((a) => [a.statusWord, a.rank])).toEqual([
      ['CALL BREACHED', 1],
      ['EXPIRING', 4],
      ['MANAGEMENT WINDOW', 5]
    ])
  })

  it('keeps equal-rank actions in input order', () => {
    const itm = { price: '178.9000', strike: '180.0000' }

    expect(
      rankWheelActions([STRIKE_PROXIMITY, COVERED_CALL_BREACH], itm).map((a) => a.statusWord)
    ).toEqual(['STRIKE PROXIMITY', 'CALL BREACHED'])
    expect(
      rankWheelActions([COVERED_CALL_BREACH, STRIKE_PROXIMITY], itm).map((a) => a.statusWord)
    ).toEqual(['CALL BREACHED', 'STRIKE PROXIMITY'])
  })
})

describe('rankWheelActions — codes without a wheel lane', () => {
  const PROFIT_TARGET: QueueRowForCard = {
    ruleCode: 'PROFIT_TARGET',
    summary: '52.0% of max profit captured — consider closing'
  }
  const EARNINGS_PROXIMITY: QueueRowForCard = {
    ruleCode: 'EARNINGS_PROXIMITY',
    summary: 'Earnings in 3 days before your 2027-09-12 expiration'
  }
  const PMCC_ASSIGNMENT_RISK: QueueRowForCard = {
    ruleCode: 'PMCC_ASSIGNMENT_RISK',
    summary:
      'Stock is 2.3% above the $110.00 short-call strike — in the money, LEAPS would have to cover'
  }

  it('drops PROFIT_TARGET, EARNINGS_PROXIMITY and PMCC_ASSIGNMENT_RISK rows', () => {
    expect(
      rankWheelActions([PROFIT_TARGET, EARNINGS_PROXIMITY, PMCC_ASSIGNMENT_RISK], OTM_CTX)
    ).toEqual([])
  })

  it('keeps only the lane rows from a mixed list', () => {
    expect(
      rankWheelActions([PROFIT_TARGET, MANAGEMENT_WINDOW, PMCC_ASSIGNMENT_RISK], OTM_CTX)
    ).toEqual([expect.objectContaining({ statusWord: 'MANAGEMENT WINDOW', rank: 5 })])
  })
})

describe('formatActionLine', () => {
  it('joins glyph, status word and summary', () => {
    expect(
      formatActionLine({
        glyph: '◷',
        statusWord: 'EXPIRING',
        tone: 'gold',
        rank: 4,
        summary: 'Expires in 4 days at $430.00 strike'
      })
    ).toBe('◷ EXPIRING · Expires in 4 days at $430.00 strike')
  })
})

describe('actionsByPosition', () => {
  const AAPL_CTX = { price: '182.45', strike: '180.0000' }
  const MSFT_CTX = { price: '421.50', strike: '430.0000' }
  // A second short put, trading below its strike — STRIKE_PROXIMITY only fires on a CSP.
  const AMD_CTX = { price: '148.20', strike: '150.0000' }

  it('groups rows by position and ranks each group', () => {
    const rows = [
      { positionId: 'pos-aapl', ...MANAGEMENT_WINDOW },
      { positionId: 'pos-msft', ...EXPIRATION_IMMINENT },
      { positionId: 'pos-aapl', ...COVERED_CALL_BREACH }
    ]
    const ctxById = new Map([
      ['pos-aapl', AAPL_CTX],
      ['pos-msft', MSFT_CTX]
    ])

    expect(actionsByPosition(rows, ctxById)).toEqual(
      new Map([
        [
          'pos-aapl',
          [
            {
              glyph: '▲',
              statusWord: 'CALL BREACHED',
              tone: 'red',
              rank: 1,
              summary: 'Stock is 1.2% above the $430.00 call strike — shares may be called away'
            },
            {
              glyph: '◷',
              statusWord: 'MANAGEMENT WINDOW',
              tone: 'gold',
              rank: 5,
              summary: '10 DTE remaining — review for roll or close'
            }
          ]
        ],
        [
          'pos-msft',
          [
            {
              glyph: '◷',
              statusWord: 'EXPIRING',
              tone: 'gold',
              rank: 4,
              summary: 'Expires in 4 days at $430.00 strike'
            }
          ]
        ]
      ])
    )
  })

  it("tones each position's STRIKE_PROXIMITY row by that position's own price and strike", () => {
    const rows = [
      { positionId: 'pos-aapl', ...STRIKE_PROXIMITY },
      { positionId: 'pos-amd', ...STRIKE_PROXIMITY }
    ]
    const ctxById = new Map([
      ['pos-aapl', AAPL_CTX],
      ['pos-amd', AMD_CTX]
    ])

    const result = actionsByPosition(rows, ctxById)

    expect(result.get('pos-aapl')).toEqual([expect.objectContaining({ tone: 'gold', rank: 2 })])
    expect(result.get('pos-amd')).toEqual([expect.objectContaining({ tone: 'red', rank: 1 })])
  })

  it('omits a position whose rows are all codes without a wheel lane', () => {
    const rows = [
      { positionId: 'pos-aapl', ruleCode: 'PROFIT_TARGET' as const, summary: '52.0% captured' },
      { positionId: 'pos-msft', ...MANAGEMENT_WINDOW }
    ]
    const ctxById = new Map([
      ['pos-aapl', AAPL_CTX],
      ['pos-msft', MSFT_CTX]
    ])

    expect([...actionsByPosition(rows, ctxById).keys()]).toEqual(['pos-msft'])
  })

  it('omits rows for a position that has no lane context', () => {
    const rows = [
      { positionId: 'pos-closed', ...MANAGEMENT_WINDOW },
      { positionId: 'pos-aapl', ...MANAGEMENT_WINDOW }
    ]

    expect([...actionsByPosition(rows, new Map([['pos-aapl', AAPL_CTX]])).keys()]).toEqual([
      'pos-aapl'
    ])
  })

  it('returns an empty map for an empty queue', () => {
    expect(actionsByPosition([], new Map([['pos-aapl', AAPL_CTX]]))).toEqual(new Map())
  })
})

describe('CardAction — rank and status word are closed sets', () => {
  it('ranks only into the four wheel lanes', () => {
    expectTypeOf<CardAction['rank']>().toEqualTypeOf<1 | 2 | 4 | 5>()
  })

  it('names only the four wheel status words', () => {
    expectTypeOf<CardAction['statusWord']>().toEqualTypeOf<
      'CALL BREACHED' | 'STRIKE PROXIMITY' | 'EXPIRING' | 'MANAGEMENT WINDOW'
    >()
  })
})
