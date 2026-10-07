import { render, screen, within } from '@testing-library/react'
import { addDays, format } from 'date-fns'
import type { PmccOpenLegs } from '../../api/positions'
import { SHARES_VERDICT, WHEEL_COMPLETE_VERDICT } from '../../lib/verdict'
import { PmccLegReference } from './PmccLegReference'

function localDate(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd')
}

const leapsLeg: PmccOpenLegs['long'] = {
  id: 'leg-leaps',
  positionId: 'pmcc-1',
  legRole: 'LEAPS_OPEN',
  action: 'BUY',
  instrumentType: 'CALL',
  strike: '80.0000',
  expiration: localDate(368),
  contracts: 2,
  premiumPerContract: '25.0000',
  fillPrice: '25.0000',
  fillDate: '2026-09-14',
  rollChainId: null,
  fees: '1.2500',
  createdAt: '2026-09-14T00:00:00Z',
  updatedAt: '2026-09-14T00:00:00Z'
}

const shortLeg: NonNullable<PmccOpenLegs['short']> = {
  ...leapsLeg,
  id: 'leg-short',
  legRole: 'SHORT_CALL_OPEN',
  action: 'SELL',
  strike: '110.0000',
  expiration: localDate(32),
  premiumPerContract: '2.0000',
  fillDate: '2026-09-15',
  fees: '0.6500'
}

function renderReference(): void {
  render(
    <PmccLegReference openLegs={{ long: leapsLeg, short: shortLeg }} initialNetDebit="4601.9000" />
  )
}

function section(title: string): HTMLElement {
  const card = screen.getByText(title).closest('section')
  if (!card) throw new Error(`no section titled ${title}`)
  return card
}

const LEG_FIELDS = ['Strike', 'Expiration', 'DTE', 'Contracts', 'Actual fill', 'Fill date', 'Fees']

describe('PmccLegReference', () => {
  it.each(['Buy LEAPS call', 'Sell short call'])('"%s" card lists every leg field', (title) => {
    renderReference()
    const card = within(section(title))
    LEG_FIELDS.forEach((label) => expect(card.getByText(label)).toBeInTheDocument())
  })

  it('the LEAPS card shows the long leg values', () => {
    renderReference()
    const card = within(section('Buy LEAPS call'))
    expect(card.getByText('$80.00')).toBeInTheDocument()
    expect(card.getByText(leapsLeg.expiration)).toBeInTheDocument()
    expect(card.getByText('368d')).toBeInTheDocument()
    expect(card.getByText('2')).toBeInTheDocument()
    expect(card.getByText('$25.00')).toBeInTheDocument()
    expect(card.getByText('2026-09-14')).toBeInTheDocument()
    expect(card.getByText('$1.25')).toBeInTheDocument()
  })

  it('the short-call card shows the short leg values', () => {
    renderReference()
    const card = within(section('Sell short call'))
    expect(card.getByText('$110.00')).toBeInTheDocument()
    expect(card.getByText(shortLeg.expiration)).toBeInTheDocument()
    expect(card.getByText('32d')).toBeInTheDocument()
    expect(card.getByText('$2.00')).toBeInTheDocument()
    expect(card.getByText('2026-09-15')).toBeInTheDocument()
    expect(card.getByText('$0.65')).toBeInTheDocument()
  })

  it('shows the server-provided initial net debit, formatted', () => {
    renderReference()
    const stat = screen.getByText('Initial net debit').parentElement
    expect(stat).toHaveTextContent('Initial net debit$4,601.90')
  })

  it('shows the server value as given rather than recomputing it from the legs', () => {
    // The legs alone would give 2 × 100 × 23.00 + 1.90 = 4,601.90.
    render(
      <PmccLegReference
        openLegs={{ long: leapsLeg, short: shortLeg }}
        initialNetDebit="6900.0200"
      />
    )
    const stat = screen.getByText('Initial net debit').parentElement
    expect(stat).toHaveTextContent('Initial net debit$6,900.02')
  })

  it('shows — for the DTE of a leg whose expiration cannot be parsed', () => {
    render(
      <PmccLegReference
        openLegs={{ long: { ...leapsLeg, expiration: 'not-a-date' }, short: shortLeg }}
        initialNetDebit="4601.9000"
      />
    )
    const dte = within(section('Buy LEAPS call')).getByText('DTE').parentElement
    expect(dte).toHaveTextContent('DTE—')
  })

  it('shows — for the initial net debit when the server has none', () => {
    render(<PmccLegReference openLegs={{ long: leapsLeg, short: null }} initialNetDebit={null} />)
    const stat = screen.getByText('Initial net debit').parentElement
    expect(stat).toHaveTextContent('Initial net debit—')
  })

  // [US-104] The cards follow the open legs, not the opening rows: a rolled short is the ROLL_TO.
  it('a rolled short call still reads Sell short call and shows the replacement', () => {
    const rolledShort: NonNullable<PmccOpenLegs['short']> = {
      ...shortLeg,
      id: 'leg-roll-to',
      legRole: 'ROLL_TO',
      strike: '112.0000',
      premiumPerContract: '2.4000'
    }
    render(
      <PmccLegReference
        openLegs={{ long: leapsLeg, short: rolledShort }}
        initialNetDebit="4601.9000"
      />
    )
    const card = within(section('Sell short call'))
    expect(card.getByText('$112.00')).toBeInTheDocument()
    expect(card.getByText('$2.40')).toBeInTheDocument()
    expect(card.queryByText('$110.00')).not.toBeInTheDocument()
    expect(screen.getByText('Initial net debit').parentElement).toHaveTextContent(
      'Initial net debit$4,601.90'
    )
  })

  it('with no open short call renders only the LEAPS card and the net-debit card', () => {
    render(
      <PmccLegReference openLegs={{ long: leapsLeg, short: null }} initialNetDebit="4601.9000" />
    )
    expect(screen.getByText('Buy LEAPS call')).toBeInTheDocument()
    expect(screen.queryByText('Sell short call')).not.toBeInTheDocument()
    expect(screen.getByText('Initial net debit').parentElement).toHaveTextContent(
      'Initial net debit$4,601.90'
    )
  })

  it('states that live P&L is unavailable', () => {
    renderReference()
    expect(screen.getByText('Live P&L unavailable until PMCC valuation ships')).toBeInTheDocument()
  })

  it('renders no verdict, P&L summary or cost-basis drawer', () => {
    renderReference()
    expect(screen.queryByTestId('pnl-summary')).not.toBeInTheDocument()
    expect(screen.queryByText('Cost basis & history')).not.toBeInTheDocument()
    expect(screen.queryByText(SHARES_VERDICT.label)).not.toBeInTheDocument()
    expect(screen.queryByText(SHARES_VERDICT.sub)).not.toBeInTheDocument()
    expect(screen.queryByText(WHEEL_COMPLETE_VERDICT.label)).not.toBeInTheDocument()
  })
})
