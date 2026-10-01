import { render, screen, within } from '@testing-library/react'
import { addDays, format } from 'date-fns'
import type { LegDetail } from '../../api/positions'
import { SHARES_VERDICT, WHEEL_COMPLETE_VERDICT } from '../../lib/verdict'
import { PmccLegReference } from './PmccLegReference'

function localDate(days: number): string {
  return format(addDays(new Date(), days), 'yyyy-MM-dd')
}

const leapsLeg: LegDetail = {
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

const shortLeg: LegDetail = {
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
  render(<PmccLegReference legs={[leapsLeg, shortLeg]} initialNetDebit="4601.9000" />)
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
    render(<PmccLegReference legs={[leapsLeg, shortLeg]} initialNetDebit="6900.0200" />)
    const stat = screen.getByText('Initial net debit').parentElement
    expect(stat).toHaveTextContent('Initial net debit$6,900.02')
  })

  it('shows — for the DTE of a leg whose expiration cannot be parsed', () => {
    render(
      <PmccLegReference
        legs={[{ ...leapsLeg, expiration: 'not-a-date' }, shortLeg]}
        initialNetDebit="4601.9000"
      />
    )
    const dte = within(section('Buy LEAPS call')).getByText('DTE').parentElement
    expect(dte).toHaveTextContent('DTE—')
  })

  it('shows — for the initial net debit when the server has none', () => {
    render(<PmccLegReference legs={[leapsLeg]} initialNetDebit={null} />)
    const stat = screen.getByText('Initial net debit').parentElement
    expect(stat).toHaveTextContent('Initial net debit—')
  })

  it('shows — for the initial net debit and no leg cards when there are no legs', () => {
    render(<PmccLegReference legs={[]} initialNetDebit={null} />)
    const stat = screen.getByText('Initial net debit').parentElement
    expect(stat).toHaveTextContent('Initial net debit—')
    expect(screen.queryByText('Buy LEAPS call')).not.toBeInTheDocument()
    expect(screen.queryByText('Sell short call')).not.toBeInTheDocument()
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
