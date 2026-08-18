// [US-68] The capital/yield row under the promoted form's field grid. It recomputes
// live from whatever is in the inputs, so the trader sees the consequence of an
// override before submitting. The AC pins the capital figure ($18,000 for 180 × 100 × 1).
import { render, screen } from '@testing-library/react'
import { addDays, format } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { NewWheelDerivedRow } from './NewWheelDerivedRow'

/**
 * The **local** calendar date `days` from today.
 *
 * The basis has to match `computeDte`, which is `differenceInCalendarDays` over a
 * `parseISO`'d date-only string — and both of those resolve to *local* midnight, not UTC.
 * Deriving the fixture from the UTC day instead put the DTE off by one whenever the two
 * calendars disagree, so these yield assertions failed every evening west of UTC (and
 * every morning east of it) and passed the rest of the day.
 */
function localDatePlusDays(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd')
}

const EXPIRATION_37_DTE = localDatePlusDays(37)

const PROMOTED = {
  strike: '180',
  contracts: '1',
  premium: '2.70',
  expiration: EXPIRATION_37_DTE
}

const capital = (): HTMLElement => screen.getByTestId('derived-capital')
const yieldCell = (): HTMLElement => screen.getByTestId('derived-yield')

describe('NewWheelDerivedRow', () => {
  it('shows the capital the put secures, grouped and unrounded to cents', () => {
    render(<NewWheelDerivedRow {...PROMOTED} />)

    expect(capital()).toHaveTextContent('$18,000')
  })

  it('shows how the capital was arrived at', () => {
    render(<NewWheelDerivedRow {...PROMOTED} />)

    expect(capital()).toHaveTextContent('180 × 100 × 1 contract')
  })

  it('pluralizes the capital caption for multiple contracts', () => {
    render(<NewWheelDerivedRow {...PROMOTED} contracts="3" />)

    expect(capital()).toHaveTextContent('$54,000')
    expect(capital()).toHaveTextContent('180 × 100 × 3 contracts')
  })

  it('shows the period and annualized yield if the put expires flat', () => {
    render(<NewWheelDerivedRow {...PROMOTED} />)

    expect(yieldCell()).toHaveTextContent('1.5% period · 14.8%/yr')
  })

  it('recomputes the yield from an overridden premium while the capital holds', () => {
    render(<NewWheelDerivedRow {...PROMOTED} premium="2.65" edited />)

    expect(yieldCell()).toHaveTextContent('1.47% period · 14.52%/yr')
    expect(capital()).toHaveTextContent('$18,000')
  })

  it('says the yield came from the trader’s own price when the premium was overridden', () => {
    render(<NewWheelDerivedRow {...PROMOTED} premium="2.65" edited />)

    expect(yieldCell()).toHaveTextContent('recomputed from your price')
  })

  it('does not claim a recomputation when the promoted premium is untouched', () => {
    render(<NewWheelDerivedRow {...PROMOTED} />)

    expect(yieldCell()).not.toHaveTextContent('recomputed from your price')
  })

  it.each([
    ['strike', { strike: '' }],
    ['strike', { strike: 'abc' }],
    ['contracts', { contracts: '' }],
    ['contracts', { contracts: '0' }]
  ])('renders a placeholder rather than NaN for an unusable %s', (_field, override) => {
    render(<NewWheelDerivedRow {...PROMOTED} {...override} />)

    expect(capital()).toHaveTextContent('—')
    expect(capital()).not.toHaveTextContent('NaN')
  })

  it.each([
    ['premium', { premium: '' }],
    ['premium', { premium: 'abc' }],
    ['strike', { strike: '' }],
    ['expiration', { expiration: '' }]
  ])('renders a placeholder rather than NaN for an unusable %s yield input', (_field, override) => {
    render(<NewWheelDerivedRow {...PROMOTED} {...override} />)

    expect(yieldCell()).toHaveTextContent('—')
    expect(yieldCell()).not.toHaveTextContent('NaN')
  })

  it('renders a placeholder rather than dividing by a zero-DTE expiration', () => {
    render(<NewWheelDerivedRow {...PROMOTED} expiration={localDatePlusDays(0)} />)

    expect(yieldCell()).toHaveTextContent('—')
    expect(yieldCell()).not.toHaveTextContent('Infinity')
  })

  it('labels both halves the way the promoted form names them', () => {
    render(<NewWheelDerivedRow {...PROMOTED} />)

    expect(capital()).toHaveTextContent('Capital required')
    expect(yieldCell()).toHaveTextContent('Yield if flat')
  })
})
