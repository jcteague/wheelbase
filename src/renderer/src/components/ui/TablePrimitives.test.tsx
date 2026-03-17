import { render } from '@testing-library/react'
import { TableCell, TableHeader } from './TablePrimitives'

describe('TableHeader', () => {
  it('renders as th with children', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <TableHeader>Strike</TableHeader>
          </tr>
        </thead>
      </table>
    )
    const th = container.querySelector('th')
    expect(th).toBeInTheDocument()
    expect(th).toHaveTextContent('Strike')
  })

  it('applies uppercase mono muted styles', () => {
    const { container } = render(
      <table>
        <thead>
          <tr>
            <TableHeader>Phase</TableHeader>
          </tr>
        </thead>
      </table>
    )
    const th = container.querySelector('th') as HTMLElement
    const style = th.getAttribute('style') ?? ''
    expect(style).toContain('text-transform: uppercase')
    expect(style).toContain('var(--wb-text-muted)')
  })
})

describe('TableCell', () => {
  it('renders as td with children', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableCell>245.00</TableCell>
          </tr>
        </tbody>
      </table>
    )
    const td = container.querySelector('td')
    expect(td).toBeInTheDocument()
    expect(td).toHaveTextContent('245.00')
  })

  it('applies mono font and padding', () => {
    const { container } = render(
      <table>
        <tbody>
          <tr>
            <TableCell>val</TableCell>
          </tr>
        </tbody>
      </table>
    )
    const td = container.querySelector('td') as HTMLElement
    const style = td.getAttribute('style') ?? ''
    expect(style).toContain('padding')
    expect(style).toContain('font-family')
  })
})
