import { render, screen } from '@testing-library/react'
import { CardFooterCell } from './CardFooterCell'

describe('CardFooterCell', () => {
  it('renders the label, the value in its colour and the note', () => {
    render(
      <CardFooterCell label="Cost basis" valueClassName="text-wb-sky" sub="/ share">
        $176.50
      </CardFooterCell>
    )

    expect(screen.getByText('Cost basis')).toHaveClass('uppercase')
    expect(screen.getByText('$176.50')).toHaveClass('text-wb-sky')
    expect(screen.getByText('/ share')).toBeInTheDocument()
  })
})
