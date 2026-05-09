import { render, screen } from '@testing-library/react'
import { UnrealizedPnlCell } from './UnrealizedPnlCell'

type Leg = {
  contracts: number
  entryPremiumPerContract: string
}

type Snapshot = {
  mid: string
}

function renderInTable(ui: React.ReactNode): ReturnType<typeof render> {
  return render(
    <table>
      <tbody>
        <tr>{ui}</tr>
      </tbody>
    </table>
  )
}

describe('UnrealizedPnlCell', () => {
  it('renders dash when leg is null', () => {
    renderInTable(<UnrealizedPnlCell ticker="AAPL" leg={null} snapshot={undefined} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders dash when snapshot is undefined', () => {
    const leg: Leg = { contracts: 1, entryPremiumPerContract: '3.50' }

    renderInTable(<UnrealizedPnlCell ticker="AAPL" leg={leg} snapshot={undefined} />)

    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders +$220.00 on line 1 and +62.9% on line 2 in green when profitable', () => {
    const leg: Leg = { contracts: 1, entryPremiumPerContract: '3.50' }
    const snapshot: Snapshot = { mid: '1.30' }

    renderInTable(<UnrealizedPnlCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    const dollar = screen.getByText('+$220.00')
    const percent = screen.getByText('+62.9%')
    expect(dollar).toBeInTheDocument()
    expect(percent).toBeInTheDocument()
    expect(dollar.className).toContain('text-wb-green')
    expect(percent.className).toContain('text-wb-green')
  })

  it('renders -$170.00 on line 1 and -48.6% on line 2 in red when at a loss', () => {
    const leg: Leg = { contracts: 1, entryPremiumPerContract: '3.50' }
    const snapshot: Snapshot = { mid: '5.20' }

    renderInTable(<UnrealizedPnlCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    const dollar = screen.getByText('-$170.00')
    const percent = screen.getByText('-48.6%')
    expect(dollar).toBeInTheDocument()
    expect(percent).toBeInTheDocument()
    expect(dollar.className).toContain('text-wb-red')
    expect(percent.className).toContain('text-wb-red')
  })

  it('cell carries title attribute with the percent label when profitable', () => {
    const leg: Leg = { contracts: 1, entryPremiumPerContract: '3.50' }
    const snapshot: Snapshot = { mid: '1.30' }

    renderInTable(<UnrealizedPnlCell ticker="AAPL" leg={leg} snapshot={snapshot} />)

    expect(screen.getByTitle('62.9% of max profit')).toBeInTheDocument()
  })

  it('renders the testId on the wrapping cell', () => {
    const leg: Leg = { contracts: 1, entryPremiumPerContract: '3.50' }
    const snapshot: Snapshot = { mid: '1.30' }

    const { container } = renderInTable(
      <UnrealizedPnlCell ticker="AAPL" leg={leg} snapshot={snapshot} />
    )

    const cell = container.querySelector('[data-testid="position-card-AAPL-pnl"]')
    expect(cell).toBeInTheDocument()
  })
})
