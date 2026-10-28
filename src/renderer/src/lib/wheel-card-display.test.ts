import { describe, expect, expectTypeOf, it } from 'vitest'
import type { WheelListItem } from '../api/positions'
import { AAPL, AAPL_QUOTE, MSFT, NVDA, TSLA, optionSnapshot } from '../test-fixtures/wheel-cards'
import {
  deriveWheelCardDisplay,
  type ClosedCardDisplay,
  type OptionCardDisplay,
  type OptionLeg,
  type SharesCardDisplay,
  type ValuedPnl,
  type WheelCardDisplay
} from './wheel-card-display'

const OPEN = { closed: false }

function aaplAtMid(mid: string): ReturnType<typeof deriveWheelCardDisplay> {
  return deriveWheelCardDisplay(AAPL, optionSnapshot('2.55', '2.65', mid), AAPL_QUOTE, OPEN)
}

describe('deriveWheelCardDisplay — unrealized P&L', () => {
  it('reads a gain on the AAPL put as dollars and a signed share of max profit', () => {
    const display = aaplAtMid('2.60')
    expect(display.pnl).toEqual({
      amount: '+$90.00',
      tone: 'gain',
      target: null,
      percentLine: '+25.7% of max profit'
    })
  })

  it('reads a loss when the option has gained value', () => {
    const display = aaplAtMid('5.20')
    expect(display.pnl).toEqual({
      amount: '-$170.00',
      tone: 'loss',
      target: null,
      percentLine: '-48.6% of max profit'
    })
  })

  it('treats a break-even mark as a gain of zero', () => {
    const display = aaplAtMid('3.50')
    expect(display.pnl).toEqual({
      amount: '+$0.00',
      tone: 'gain',
      target: null,
      percentLine: '+0% of max profit'
    })
  })

  it('treats one cent over the fill as a loss', () => {
    const display = aaplAtMid('3.51')
    expect(display.pnl).toEqual({
      amount: '-$1.00',
      tone: 'loss',
      target: null,
      percentLine: '-0.3% of max profit'
    })
  })

  it('signs a loss that rounds to 0% with a minus, matching the red dollar figure', () => {
    const item: WheelListItem = { ...AAPL, entryPremiumPerContract: '30.0000' }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('30.00', '30.02', '30.01'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display.pnl).toEqual({
      amount: '-$1.00',
      tone: 'loss',
      target: null,
      percentLine: '-0% of max profit'
    })
  })

  it('signs a gain that rounds to 0% with a plus', () => {
    const item: WheelListItem = { ...AAPL, entryPremiumPerContract: '30.0000' }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('29.98', '30.00', '29.99'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display.pnl).toMatchObject({
      amount: '+$1.00',
      tone: 'gain',
      percentLine: '+0% of max profit'
    })
  })

  it('reads "unavailable" when the leg is open but no snapshot came back', () => {
    const display = deriveWheelCardDisplay(AAPL, undefined, AAPL_QUOTE, OPEN)
    expect(display.pnl).toBe('unavailable')
  })

  it('reads "unavailable" rather than throwing when the stored fill is not positive', () => {
    const item: WheelListItem = { ...AAPL, entryPremiumPerContract: '0.0000' }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('2.55', '2.65', '2.60'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display.pnl).toBe('unavailable')
  })

  it('reads "unavailable" rather than throwing when the snapshot mid is negative', () => {
    const display = aaplAtMid('-0.10')
    expect(display.pnl).toBe('unavailable')
  })
})

describe('deriveWheelCardDisplay — option mid boundary (a mid of 0 or more is usable)', () => {
  it('values a zero mid as the whole credit captured', () => {
    const display = deriveWheelCardDisplay(AAPL, optionSnapshot('0', '0', '0'), AAPL_QUOTE, OPEN)
    expect(display).toMatchObject({
      pnl: {
        amount: '+$350.00',
        tone: 'gain',
        target: { pnlPercent: '100.0000', maxProfit: '350.0000', targetPercent: 50 },
        percentLine: '+100% of max profit'
      },
      leg: { mark: { mid: '$0.00', note: { kind: 'noBid' } } }
    })
  })

  it('rejects a mid one ten-thousandth below zero', () => {
    const display = deriveWheelCardDisplay(
      AAPL,
      optionSnapshot('0', '0', '-0.0001'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display).toMatchObject({ pnl: 'unavailable', leg: { mark: 'unavailable' } })
  })
})

describe('deriveWheelCardDisplay — contracts (a whole number of at least 1 is valued)', () => {
  it.each([
    { contracts: 0, pnl: 'unavailable' },
    {
      contracts: 1,
      pnl: { amount: '+$90.00', tone: 'gain', target: null, percentLine: '+25.7% of max profit' }
    },
    { contracts: 1.5, pnl: 'unavailable' },
    {
      contracts: 2,
      pnl: { amount: '+$180.00', tone: 'gain', target: null, percentLine: '+25.7% of max profit' }
    }
  ] as const)('$contracts contracts at a $2.60 mid → P&L $pnl', ({ contracts, pnl }) => {
    const item: WheelListItem = { ...AAPL, contracts }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('2.55', '2.65', '2.60'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display).toMatchObject({ pnl, leg: { mark: { mid: '$2.60', note: null } } })
  })
})

describe('deriveWheelCardDisplay — profit target', () => {
  it('reports the TARGET figures once the MSFT call has captured 53.6%', () => {
    const display = deriveWheelCardDisplay(
      MSFT,
      optionSnapshot('1.25', '1.35', '1.30'),
      undefined,
      OPEN
    )
    expect(display.pnl).toMatchObject({
      target: { pnlPercent: '53.5714', maxProfit: '280.0000', targetPercent: 50 }
    })
  })

  it('reaches the target exactly at 50%', () => {
    expect(aaplAtMid('1.75').pnl).toMatchObject({
      target: { pnlPercent: '50.0000', maxProfit: '350.0000', targetPercent: 50 }
    })
  })

  it('does not reach the target just under 50%', () => {
    const display = aaplAtMid('1.76')
    expect(display.pnl).toMatchObject({
      percentLine: '+49.7% of max profit',
      target: null
    })
  })

  it('uses the settings default when the position has no override', () => {
    const display = deriveWheelCardDisplay(
      AAPL,
      optionSnapshot('2.55', '2.65', '2.60'),
      AAPL_QUOTE,
      { closed: false, profitTargetDefault: 25 }
    )
    expect(display.pnl).toMatchObject({
      target: { pnlPercent: '25.7143', maxProfit: '350.0000', targetPercent: 25 }
    })
  })

  it("prefers the position's own target over the settings default", () => {
    const item: WheelListItem = { ...MSFT, profitTargetPercent: 60 }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('1.25', '1.35', '1.30'),
      undefined,
      {
        closed: false,
        profitTargetDefault: 50
      }
    )
    expect(display.pnl).toMatchObject({
      percentLine: '+53.6% of max profit',
      target: null
    })
  })
})

describe('deriveWheelCardDisplay — header price', () => {
  it('passes the live price through with the days to expiration', () => {
    expect(aaplAtMid('2.60')).toMatchObject({
      kind: 'option',
      price: '182.45',
      priceSubline: '30d to expiration'
    })
  })

  it('has no price without a quote', () => {
    expect(deriveWheelCardDisplay(AAPL, undefined, undefined, OPEN).price).toBeNull()
  })
})

describe('deriveWheelCardDisplay — leg block', () => {
  it('describes the open AAPL put', () => {
    expect(aaplAtMid('2.60')).toMatchObject({
      kind: 'option',
      leg: {
        tag: 'P',
        title: '$180.00 put',
        expiration: '2027-09-12',
        dte: '30d',
        dteUrgent: false,
        mark: { mid: '$2.60', note: null },
        credit: '$3.50'
      }
    })
  })

  it('tags the MSFT call C', () => {
    const display = deriveWheelCardDisplay(
      MSFT,
      optionSnapshot('1.75', '1.85', '1.80'),
      undefined,
      OPEN
    )
    expect(display).toMatchObject({ kind: 'option', leg: { tag: 'C', title: '$430.00 call' } })
  })

  it('marks the mid "unavailable" when no snapshot came back', () => {
    const display = deriveWheelCardDisplay(AAPL, undefined, AAPL_QUOTE, OPEN)
    expect(display).toMatchObject({ kind: 'option', leg: { mark: 'unavailable' } })
  })

  it('marks the mid "unavailable" when the snapshot is malformed', () => {
    const display = deriveWheelCardDisplay(
      AAPL,
      optionSnapshot('', '2.65', '2.60'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display).toMatchObject({
      kind: 'option',
      pnl: 'unavailable',
      leg: { mark: 'unavailable' }
    })
  })

  it('still shows the mid when only the stored fill is unusable', () => {
    const item: WheelListItem = { ...AAPL, entryPremiumPerContract: null }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('2.55', '2.65', '2.60'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display).toMatchObject({
      kind: 'option',
      leg: { mark: { mid: '$2.60', note: null }, credit: '—' }
    })
  })

  it('dashes the parts of an option leg the list item left null', () => {
    const item: WheelListItem = { ...AAPL, strike: null, expiration: null, dte: null }
    expect(deriveWheelCardDisplay(item, undefined, undefined, OPEN)).toMatchObject({
      kind: 'option',
      priceSubline: '—',
      leg: { title: '— put', expiration: '—', dte: '—' }
    })
  })

  it('warns on a wide spread with the US-33 tooltip', () => {
    const display = deriveWheelCardDisplay(
      AAPL,
      optionSnapshot('0.50', '1.50', '1.00'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display.leg).toMatchObject({
      mark: {
        mid: '$1.00',
        note: { kind: 'wideSpread', tooltip: 'Wide spread: $0.50 × $1.50 — P&L may be unreliable' }
      }
    })
  })

  it('reads "no bid" instead of the wide-spread warning when the bid is zero', () => {
    const display = deriveWheelCardDisplay(
      AAPL,
      optionSnapshot('0', '0.06', '0.03'),
      AAPL_QUOTE,
      OPEN
    )
    expect(display.leg).toMatchObject({ mark: { mid: '$0.03', note: { kind: 'noBid' } } })
  })

  it('marks the DTE urgent at 7 days', () => {
    expect(deriveWheelCardDisplay({ ...AAPL, dte: 7 }, undefined, undefined, OPEN)).toMatchObject({
      kind: 'option',
      leg: { dteUrgent: true }
    })
  })

  it('does not mark the DTE urgent at 8 days', () => {
    expect(deriveWheelCardDisplay({ ...AAPL, dte: 8 }, undefined, undefined, OPEN)).toMatchObject({
      kind: 'option',
      leg: { dteUrgent: false }
    })
  })
})

describe('deriveWheelCardDisplay — no option leg', () => {
  it('shows the placeholder leg and no P&L while holding shares', () => {
    expect(deriveWheelCardDisplay(NVDA, undefined, AAPL_QUOTE, OPEN)).toEqual({
      kind: 'shares',
      price: '182.45',
      priceSubline: 'shares held · no option leg',
      pnl: 'no option leg open',
      leg: 'no option leg open — sell a covered call'
    })
  })
})

describe('deriveWheelCardDisplay — closed', () => {
  it('shows no live figures for a closed wheel', () => {
    expect(deriveWheelCardDisplay(TSLA, undefined, undefined, { closed: true })).toEqual({
      kind: 'closed',
      price: null,
      priceSubline: 'closed',
      pnl: 'closed — no live marks',
      leg: 'wheel complete'
    })
  })

  it.each(['CSP_CLOSED_PROFIT', 'CSP_CLOSED_LOSS'] as const)(
    'reads "position closed", not "wheel complete", for a CSP bought back (%s)',
    (phase) => {
      const item: WheelListItem = { ...TSLA, phase }
      expect(deriveWheelCardDisplay(item, undefined, undefined, { closed: true })).toMatchObject({
        kind: 'closed',
        leg: 'position closed'
      })
    }
  )

  it('ignores a snapshot, a quote and a near expiration once closed', () => {
    const item: WheelListItem = { ...MSFT, phase: 'WHEEL_COMPLETE', dte: 4 }
    const display = deriveWheelCardDisplay(
      item,
      optionSnapshot('1.25', '1.35', '1.30'),
      AAPL_QUOTE,
      { closed: true }
    )
    expect(display).toEqual({
      kind: 'closed',
      price: null,
      priceSubline: 'closed',
      pnl: 'closed — no live marks',
      leg: 'wheel complete'
    })
  })
})

describe('WheelCardDisplay — the states the AC forbids do not type-check', () => {
  it('gives a closed card no live P&L, TARGET or option leg', () => {
    expectTypeOf<
      Omit<ClosedCardDisplay, 'pnl'> & { pnl: ValuedPnl }
    >().not.toExtend<WheelCardDisplay>()
    expectTypeOf<
      Omit<ClosedCardDisplay, 'leg'> & { leg: OptionLeg }
    >().not.toExtend<WheelCardDisplay>()
  })

  it('reads a shares-only card "no option leg open", never "unavailable"', () => {
    expectTypeOf<
      Omit<SharesCardDisplay, 'pnl'> & { pnl: 'unavailable' }
    >().not.toExtend<WheelCardDisplay>()
  })

  it('never blanks an open option leg as closed', () => {
    expectTypeOf<
      Omit<OptionCardDisplay, 'pnl'> & { pnl: 'closed — no live marks' }
    >().not.toExtend<WheelCardDisplay>()
  })
})
