import { fireEvent, render, screen } from '@testing-library/react'
import { PHASE_TOKEN } from '../../lib/phase'
import { CardShell } from './CardShell'
import type { CardAccent } from './types'

const HREF = '#/positions/pos-aapl'

beforeEach(() => {
  window.location.hash = ''
})

describe('CardShell', () => {
  it('renders a div with the default test id, the accent as data-edge and the accent border', () => {
    render(
      <CardShell accent="CSP_OPEN" href={HREF}>
        body
      </CardShell>
    )

    const card = screen.getByTestId('position-card')
    expect(card.tagName).toBe('DIV')
    expect(card).toHaveAttribute('data-edge', 'CSP_OPEN')
    expect(card).toHaveClass('border-l-2', 'border-l-wb-gold')
    expect(card).toHaveTextContent('body')
  })

  it.each([
    'CSP_OPEN',
    'CSP_EXPIRED',
    'CSP_CLOSED_PROFIT',
    'CSP_CLOSED_LOSS',
    'HOLDING_SHARES',
    'CC_OPEN',
    'CC_EXPIRED',
    'CC_CLOSED_PROFIT',
    'CC_CLOSED_LOSS',
    'WHEEL_COMPLETE'
  ] as const satisfies readonly CardAccent[])(
    'accent %s draws its phase colour token as the left border',
    (accent) => {
      render(
        <CardShell accent={accent} href={HREF}>
          body
        </CardShell>
      )

      expect(screen.getByTestId('position-card')).toHaveClass(`border-l-wb-${PHASE_TOKEN[accent]}`)
    }
  )

  it('draws the PMCC accent in the PMCC_OPEN phase colour token', () => {
    render(
      <CardShell accent="PMCC" href={HREF}>
        body
      </CardShell>
    )

    expect(screen.getByTestId('position-card')).toHaveClass('border-l-wb-teal')
    expect(PHASE_TOKEN.PMCC_OPEN).toBe('teal')
  })

  it('an action edge replaces the accent with a wider tone border', () => {
    render(
      <CardShell accent="CSP_OPEN" edge="red" href={HREF}>
        body
      </CardShell>
    )

    const card = screen.getByTestId('position-card')
    expect(card).toHaveAttribute('data-edge', 'red')
    expect(card).toHaveClass('border-l-4', 'border-l-wb-red')
    expect(card).not.toHaveClass('border-l-2')
    expect(card).not.toHaveClass('border-l-wb-gold')
  })

  it('a gold edge draws the gold tone border', () => {
    render(
      <CardShell accent="CC_OPEN" edge="gold" href={HREF}>
        body
      </CardShell>
    )

    const card = screen.getByTestId('position-card')
    expect(card).toHaveAttribute('data-edge', 'gold')
    expect(card).toHaveClass('border-l-4', 'border-l-wb-gold')
    expect(card).not.toHaveClass('border-l-wb-violet')
  })

  it('a closed card is dimmed under the closed test id, with no hover border', () => {
    render(
      <CardShell accent="WHEEL_COMPLETE" closed href={HREF}>
        body
      </CardShell>
    )

    const card = screen.getByTestId('position-card-closed')
    expect(screen.queryByTestId('position-card')).not.toBeInTheDocument()
    expect(card).toHaveClass('opacity-50')
    expect([...card.classList].filter((c) => c.startsWith('hover:'))).toEqual([])
  })

  it('an open card recolours its top, right and bottom borders on hover and is not dimmed', () => {
    render(
      <CardShell accent="CSP_OPEN" href={HREF}>
        body
      </CardShell>
    )

    const card = screen.getByTestId('position-card')
    expect(card).toHaveClass(
      'hover:border-t-wb-text-muted/60',
      'hover:border-r-wb-text-muted/60',
      'hover:border-b-wb-text-muted/60'
    )
    expect(card).not.toHaveClass('opacity-50')
  })

  // A bare `hover:border-<colour>` sets all four sides, painting over the action edge and the
  // phase accent while the pointer is on the card.
  it.each([
    ['the phase accent', undefined],
    ['an action edge', 'red']
  ] as const)('hovering never recolours the left border carrying %s', (_, edge) => {
    render(
      <CardShell accent="CSP_OPEN" edge={edge} href={HREF}>
        body
      </CardShell>
    )

    const hoverBorders = [...screen.getByTestId('position-card').classList].filter((c) =>
      c.startsWith('hover:border')
    )
    expect(hoverBorders).toHaveLength(3)
    expect(hoverBorders.filter((c) => !/^hover:border-[trb]-/.test(c))).toEqual([])
  })

  it('shows the pointer and navigates to its href from a click inside it', () => {
    render(
      <CardShell accent="CSP_OPEN" href={HREF}>
        <p>body</p>
      </CardShell>
    )

    expect(screen.getByTestId('position-card')).toHaveClass('cursor-pointer')
    fireEvent.click(screen.getByText('body'))
    expect(window.location.hash).toBe(HREF)
  })

  it('a closed card navigates too', () => {
    render(
      <CardShell accent="WHEEL_COMPLETE" closed href="#/positions/pos-tsla">
        <p>body</p>
      </CardShell>
    )

    fireEvent.click(screen.getByText('body'))
    expect(window.location.hash).toBe('#/positions/pos-tsla')
  })
})
