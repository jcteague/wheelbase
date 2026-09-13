import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BenchSection } from './BenchSection'
import { meets } from './bench-test-utils'

// [US-96] The bench is two labelled sections — Meets criteria and Stocks of interest —
// each owning its own empty state, because "nothing to sell today" and "nothing on the
// watchlist" are different messages.

const noop = (): void => {}

const EMPTY = <p data-testid="section-empty">Nothing here.</p>

describe('BenchSection', () => {
  it('labels the region with its title', () => {
    render(
      <BenchSection
        title="Meets criteria"
        stocks={[meets()]}
        selected={null}
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByRole('region', { name: 'Meets criteria' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meets criteria' })).toBeInTheDocument()
  })

  it('counts the stocks it holds', () => {
    render(
      <BenchSection
        title="Stocks of interest"
        stocks={[meets(), meets({ ticker: 'PEP' })]}
        selected={null}
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByTestId('bench-section-count')).toHaveTextContent('2')
  })

  // Green is the bench's "act now" colour; only the accented section earns it.
  it('tints the count green when the section is accented', () => {
    render(
      <BenchSection
        title="Meets criteria"
        accent
        stocks={[meets()]}
        selected={null}
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByTestId('bench-section-count').getAttribute('style')).toContain(
      'var(--wb-green)'
    )
  })

  it('leaves the count in the default treatment without the accent', () => {
    render(
      <BenchSection
        title="Stocks of interest"
        stocks={[meets()]}
        selected={null}
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByTestId('bench-section-count').getAttribute('style')).toContain(
      'var(--wb-gold)'
    )
  })

  it('renders a card per stock', () => {
    render(
      <BenchSection
        title="Meets criteria"
        stocks={[meets(), meets({ ticker: 'PEP' })]}
        selected={null}
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByTestId('watchlist-row-KO')).toBeInTheDocument()
    expect(screen.getByTestId('watchlist-row-PEP')).toBeInTheDocument()
    expect(screen.queryByTestId('section-empty')).toBeNull()
  })

  it('renders the empty node instead of cards when the section is empty', () => {
    render(
      <BenchSection
        title="Meets criteria"
        stocks={[]}
        selected={null}
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    expect(screen.getByTestId('section-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('watchlist-row-KO')).toBeNull()
  })

  it('marks the selected card', () => {
    render(
      <BenchSection
        title="Meets criteria"
        stocks={[meets(), meets({ ticker: 'PEP' })]}
        selected="PEP"
        empty={EMPTY}
        onSelect={noop}
        onRemove={noop}
      />
    )

    const ringed = (ticker: string): string =>
      (screen.getByTestId(`watchlist-row-${ticker}`).closest('section') as HTMLElement).className

    expect(ringed('PEP')).toContain('ring-wb-gold')
    expect(ringed('KO')).not.toContain('ring-wb-gold')
  })
})
