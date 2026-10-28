import { render, screen } from '@testing-library/react'
import { LegTag } from './LegTag'

describe('LegTag', () => {
  it.each([
    ['P', 'Cash-secured put', 'text-wb-gold'],
    ['C', 'Covered call', 'text-wb-violet'],
    ['·', 'No option leg open', 'text-wb-text-muted'],
    ['L', 'LEAPS — long call, the synthetic stock', 'text-wb-sky'],
    ['S', 'Short call — the income leg', 'text-wb-violet']
  ] as const)('tag %s reads "%s" in %s', (tag, tooltip, colorClass) => {
    render(<LegTag tag={tag} />)

    const el = screen.getByText(tag)
    expect(el).toHaveAttribute('title', tooltip)
    expect(el).toHaveClass(colorClass)
  })
})
