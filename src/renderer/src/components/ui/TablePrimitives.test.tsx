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

  it('applies uppercase mono muted styles via Tailwind classes', () => {
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
    expect(th).toHaveClass('uppercase')
    expect(th).toHaveClass('font-wb-mono')
    expect(th).toHaveClass('text-wb-text-muted')
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

  it('applies mono font and padding via Tailwind classes', () => {
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
    expect(td).toHaveClass('font-wb-mono')
    expect(td).toHaveClass('px-[12px]')
    expect(td).toHaveClass('py-[8px]')
  })
})
