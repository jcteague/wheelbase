import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BenchHeader } from './BenchHeader'

// [US-110] The header carries the bench's lens switch beside what is on the bench, and
// names the criteria strip after whichever lens is screening. It stays lens-agnostic: the
// page hands it chips and a label, never a criteria document.

const noop = (): void => {}

const PMCC_CHIPS = ['LEAPS Δ 0.70–0.85', 'Debit ≤ 90% width']

function renderHeader(props: Partial<Parameters<typeof BenchHeader>[0]> = {}): void {
  render(
    <BenchHeader
      title="Watchlist"
      watchlistCount={9}
      strategy="WHEEL"
      onStrategyChange={noop}
      criteriaChips={['Δ 0.20–0.30', 'DTE 30–45']}
      criteriaLabel="Criteria"
      criteriaUnloadable={false}
      staleQuoteTime={null}
      marketStatus="LIVE"
      addOpen={false}
      onOpenCriteria={noop}
      onRefresh={noop}
      onToggleAdd={noop}
      {...props}
    />
  )
}

describe('BenchHeader — lens toggle', () => {
  it('sits in the left group with the title, after the count badge', () => {
    renderHeader()

    const title = screen.getByRole('heading', { level: 1, name: 'Watchlist' })
    const toggle = screen.getByRole('group', { name: 'Screening strategy' })
    expect(title.parentElement).toContainElement(toggle)
    expect(
      screen.getByTestId('bench-count').compareDocumentPosition(toggle) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('presses the lens it is given', () => {
    renderHeader({ strategy: 'PMCC' })

    const toggle = screen.getByRole('group', { name: 'Screening strategy' })
    expect(within(toggle).getByRole('button', { name: 'PMCC' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('raises the lens the trader picks', async () => {
    const onStrategyChange = vi.fn()
    renderHeader({ onStrategyChange })

    await userEvent.click(screen.getByRole('button', { name: 'PMCC' }))

    expect(onStrategyChange).toHaveBeenCalledWith('PMCC')
  })
})

describe('BenchHeader — criteria strip', () => {
  it('names the strip after the lens and shows its chips', () => {
    renderHeader({ strategy: 'PMCC', criteriaLabel: 'PMCC criteria', criteriaChips: PMCC_CHIPS })

    const strip = screen.getByTestId('screener-criteria-strip')
    expect(within(strip).getByText('PMCC criteria')).toBeInTheDocument()
    expect(within(strip).getByText('LEAPS Δ 0.70–0.85')).toBeInTheDocument()
    expect(within(strip).getByText('Debit ≤ 90% width')).toBeInTheDocument()
    expect(within(strip).queryByText('Criteria')).toBeNull()
  })

  it('leaves the strip out until the chips load', () => {
    renderHeader({ criteriaChips: undefined })

    expect(screen.getByTestId('bench-criteria')).toBeInTheDocument()
    expect(screen.queryByTestId('screener-criteria-strip')).toBeNull()
  })
})
