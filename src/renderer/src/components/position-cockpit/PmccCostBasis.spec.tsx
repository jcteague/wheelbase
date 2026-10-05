// [US-103] PMCC cost basis drawer — the running cash ledger, never a quote.
import { render, screen } from '@testing-library/react'
import type { PmccLedgerResult } from '../../api/positions'
import { PmccCostBasis } from './PmccCostBasis'

const rsRecorded: PmccLedgerResult = {
  basisPerShare: '21.8000',
  basisTotal: '2180.0000',
  leapsCostPerShare: '25.0000',
  leapsCostTotal: '2500.0000',
  shortCreditsPerShare: '3.2000',
  shortCreditsTotal: '320.0000',
  effectiveShareCost: '101.8000',
  premiumRecoveredPercent: '12.8000'
}

const negativeLedger: PmccLedgerResult = {
  basisPerShare: '-0.4000',
  basisTotal: '-40.0000',
  leapsCostPerShare: '22.5000',
  leapsCostTotal: '2250.0000',
  shortCreditsPerShare: '22.9000',
  shortCreditsTotal: '2290.0000',
  effectiveShareCost: '84.6000',
  premiumRecoveredPercent: '101.7778'
}

const halfCentLedger: PmccLedgerResult = {
  basisPerShare: '23.0050',
  basisTotal: '2300.5000',
  leapsCostPerShare: '25.0050',
  leapsCostTotal: '2500.5000',
  shortCreditsPerShare: '2.0050',
  shortCreditsTotal: '200.5000',
  effectiveShareCost: '103.0050',
  premiumRecoveredPercent: '8.0000'
}

const LABELS = [
  'Cost basis / share',
  'Total',
  'LEAPS cost to date',
  'Short-call credits to date',
  'Effective share cost',
  'Premium recovered'
]

function drawerButton(): HTMLElement {
  return screen.getByRole('button', { name: /Cost basis\s*6 fields/ })
}

function cell(label: string): HTMLElement {
  const parent = screen.getByText(label).parentElement
  if (!parent) throw new Error(`no cell for ${label}`)
  return parent
}

function drawer(): HTMLElement {
  const root = drawerButton().parentElement
  if (!root) throw new Error('no drawer root')
  return root
}

describe('PmccCostBasis', () => {
  it('renders a Cost basis drawer with 6 fields', () => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    expect(drawerButton()).toHaveTextContent('Cost basis')
    expect(drawerButton()).toHaveTextContent('6 fields')
  })

  it('is open on mount', () => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    expect(drawerButton()).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows the cash-ledger caption', () => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    expect(screen.getByText('US-103 · cash ledger, never a quote')).toBeInTheDocument()
  })

  it('renders the six labels in order', () => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    const labels = LABELS.map((label) => screen.getByText(label))
    labels.slice(1).forEach((label, i) => {
      expect(
        labels[i].compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    })
  })

  it.each([
    ['Cost basis / share', '$21.80'],
    ['Total', '$2,180.00'],
    ['LEAPS cost to date', '$25.00'],
    ['Short-call credits to date', '-$3.20'],
    ['Effective share cost', '$101.80'],
    ['Premium recovered', '12.8%']
  ])('"%s" shows %s', (label, value) => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    expect(cell(label)).toHaveTextContent(value)
  })

  it.each([
    ['Cost basis / share', '-$0.40'],
    ['Total', '-$40.00'],
    ['Premium recovered', '101.8%']
  ])('negative basis: "%s" shows %s', (label, value) => {
    render(<PmccCostBasis ledger={negativeLedger} />)
    expect(cell(label)).toHaveTextContent(value)
  })

  it.each([
    ['Cost basis / share', '$23.01'],
    ['Total', '$2,300.50'],
    ['LEAPS cost to date', '$25.01'],
    ['Short-call credits to date', '-$2.01'],
    ['Effective share cost', '$103.01']
  ])('half-cent ledger rounds half-up: "%s" shows %s', (label, value) => {
    render(<PmccCostBasis ledger={halfCentLedger} />)
    expect(cell(label)).toHaveTextContent(value)
  })

  it('shows an em dash when premiumRecoveredPercent is null', () => {
    render(<PmccCostBasis ledger={{ ...rsRecorded, premiumRecoveredPercent: null }} />)
    expect(cell('Premium recovered')).toHaveTextContent('Premium recovered—')
  })

  it('shows an em dash when effectiveShareCost is null', () => {
    render(<PmccCostBasis ledger={{ ...rsRecorded, effectiveShareCost: null }} />)
    expect(cell('Effective share cost')).toHaveTextContent('Effective share cost—')
  })

  it.each([
    /profit/i,
    /realized/i,
    /Effective Basis \/ Share/i,
    /\bShares\b/i,
    /Max profit/i,
    /Breakeven/i,
    /Annualized/i
  ])('drawer text never matches %s', (pattern) => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    expect(drawer().textContent).not.toMatch(pattern)
  })

  it('renders short-call credits in a neutral colour, never green', () => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    const creditsCell = cell('Short-call credits to date')
    expect(creditsCell.querySelector('.text-wb-green')).toBeNull()
    expect(screen.getByText('-$3.20')).not.toHaveClass('text-wb-green')
  })

  it('renders the cost basis / share value in sky', () => {
    render(<PmccCostBasis ledger={rsRecorded} />)
    expect(screen.getByText('$21.80')).toHaveClass('text-wb-sky')
  })
})
