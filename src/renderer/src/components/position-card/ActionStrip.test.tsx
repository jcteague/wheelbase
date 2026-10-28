import { render, screen } from '@testing-library/react'
import { CALL_BREACHED, EXPIRING, MANAGEMENT_WINDOW } from '../../test-fixtures/card-actions'
import { ActionStrip } from './ActionStrip'

describe('ActionStrip', () => {
  it('renders one action as a status line in its tone with no chip', () => {
    render(<ActionStrip actions={[MANAGEMENT_WINDOW]} />)

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-testid', 'action-strip')
    expect(strip).toHaveAttribute('data-tone', 'gold')
    expect(strip).toHaveTextContent(
      /^◷MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close$/
    )
    expect(screen.getByText('MANAGEMENT WINDOW')).toHaveClass('font-bold', 'text-wb-gold')
    expect(screen.queryByText(/^\+\d+$/)).not.toBeInTheDocument()
  })

  it('leads with the first action and puts the rest on a +1 chip listing them', () => {
    render(<ActionStrip actions={[CALL_BREACHED, EXPIRING]} />)

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-tone', 'red')
    expect(strip).toHaveTextContent(
      '▲CALL BREACHED · Stock is 1.2% above the $430.00 call strike — shares may be called away'
    )
    expect(screen.getByText('CALL BREACHED')).toHaveClass('text-wb-red')
    expect(screen.getByText('+1')).toHaveAttribute(
      'title',
      'Also open:\n◷ EXPIRING · Expires in 4 days at $430.00 strike'
    )
  })

  it('counts every remaining action on the chip, one line each', () => {
    render(<ActionStrip actions={[CALL_BREACHED, EXPIRING, MANAGEMENT_WINDOW]} />)

    expect(screen.getByText('+2')).toHaveAttribute(
      'title',
      'Also open:\n◷ EXPIRING · Expires in 4 days at $430.00 strike\n◷ MANAGEMENT WINDOW · 10 DTE remaining — review for roll or close'
    )
  })

  it('renders nothing when there are no actions', () => {
    const { container } = render(<ActionStrip actions={[]} />)

    expect(container).toBeEmptyDOMElement()
  })
})
