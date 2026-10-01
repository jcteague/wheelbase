import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { calculatePmccOpeningDebit } from '../../../main/core/costbasis'
import { PmccCashFlows } from './PmccCashFlows'

function debit(fees: string): ReturnType<typeof calculatePmccOpeningDebit> {
  return calculatePmccOpeningDebit({
    contracts: 1,
    long: { strike: '80.00', fillPrice: '25.00', fees },
    short: { strike: '110.00', fillPrice: '2.00', fees }
  })
}

function row(label: string): string | null {
  return screen.getByText(label).parentElement?.textContent ?? null
}

describe('PmccCashFlows', () => {
  it('shows the fixture cash flows', () => {
    render(<PmccCashFlows debit={debit('0.00')} />)
    expect(screen.getByText('Opening cash flows')).toBeInTheDocument()
    expect(row('LEAPS purchase cost')).toBe('LEAPS purchase cost$2,500.00')
    expect(row('Short-call credit')).toBe('Short-call credit$200.00')
    expect(row('Fees')).toBe('Fees$0.00')
    expect(screen.getByText('Strike width / share: $30.00')).toBeInTheDocument()
    expect(screen.getByText('Debit / strike width, before fees: 76.67%')).toBeInTheDocument()
    expect(screen.getByText('Opening credit is not yet realized profit.')).toBeInTheDocument()
  })

  it('adds both legs’ fees while the ratio stays fee-free', () => {
    render(<PmccCashFlows debit={debit('1.00')} />)
    expect(row('Fees')).toBe('Fees$2.00')
    expect(screen.getByText('Debit / strike width, before fees: 76.67%')).toBeInTheDocument()
  })

  it('dashes every figure while the preview is unavailable', () => {
    render(<PmccCashFlows debit={null} />)
    expect(row('LEAPS purchase cost')).toBe('LEAPS purchase cost—')
    expect(row('Short-call credit')).toBe('Short-call credit—')
    expect(row('Fees')).toBe('Fees—')
    expect(screen.getByText('Strike width / share: —')).toBeInTheDocument()
    expect(screen.getByText('Debit / strike width, before fees: —')).toBeInTheDocument()
  })

  it('dashes the ratio when the strike width is not positive', () => {
    const inverted = calculatePmccOpeningDebit({
      contracts: 1,
      long: { strike: '110.00', fillPrice: '25.00', fees: '0' },
      short: { strike: '80.00', fillPrice: '2.00', fees: '0' }
    })
    render(<PmccCashFlows debit={inverted} />)
    expect(screen.getByText('Debit / strike width, before fees: —')).toBeInTheDocument()
  })

  it('never presents the credit as profit, a maximum profit or a breakeven', () => {
    const { container } = render(<PmccCashFlows debit={debit('0.00')} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/max(imum)? profit|breakeven|break-even/i)
    expect(text.replace('Opening credit is not yet realized profit.', '')).not.toMatch(/realized/i)
  })
})
