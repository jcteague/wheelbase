import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseISO } from 'date-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OptionChainQuote } from '../api/market-data'
import type { UseCallChainResult } from '../hooks/useCallChain'
import { CHAIN_NOTICE_COPY, formatContractOption } from '../lib/pmcc-entry'
import { CallContractPicker } from './CallContractPicker'

const TODAY = parseISO('2026-09-14')

const LEAPS: OptionChainQuote = {
  contractId: 'XYZ270917C00080000',
  strike: '80.0000',
  expiration: '2027-09-17',
  contractType: 'call',
  bid: '24.80',
  ask: '25.20',
  mid: '25.00',
  lastTrade: '25.00',
  openInterest: 100,
  volume: 10,
  greeks: { delta: '0.8000', gamma: '0.0100', theta: '-0.0200', vega: '0.3000' },
  timestamp: '2026-09-14T14:42:00Z'
}

const OTHER: OptionChainQuote = {
  ...LEAPS,
  contractId: 'XYZ270917C00075000',
  strike: '75.0000',
  mid: '28.00',
  greeks: undefined
}

function chain(overrides: Partial<UseCallChainResult> = {}): UseCallChainResult {
  return { status: 'success', contracts: [LEAPS, OTHER], error: null, ...overrides }
}

function renderPicker(
  props: Partial<React.ComponentProps<typeof CallContractPicker>> = {}
): ReturnType<typeof vi.fn> {
  const onSelect = vi.fn()
  render(
    <CallContractPicker
      id="long-contract"
      chain={chain()}
      today={TODAY}
      onSelect={onSelect}
      {...props}
    />
  )
  return onSelect
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-14T14:45:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('CallContractPicker', () => {
  it('lists the chain through formatContractOption after a "Choose contract / enter manually" option', () => {
    renderPicker()
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual([
      'Choose contract / enter manually',
      formatContractOption(LEAPS, TODAY),
      formatContractOption(OTHER, TODAY)
    ])
    expect(options[1]).toBe('Sep 17, 2027 · $80.00 · 368 DTE · Δ 0.80 · mid $25.00')
  })

  it('choosing an option calls onSelect with its ContractSelection', async () => {
    const onSelect = renderPicker()
    await userEvent.selectOptions(screen.getByLabelText('Contract'), LEAPS.contractId)
    expect(onSelect).toHaveBeenCalledWith({
      contractId: 'XYZ270917C00080000',
      strike: '80.00',
      expiration: '2027-09-17'
    })
  })

  it('shows the selected contract as the select value', () => {
    renderPicker({ selectedContractId: LEAPS.contractId })
    expect(screen.getByLabelText('Contract')).toHaveValue(LEAPS.contractId)
  })

  it('"Enter manually" calls onSelect(null)', async () => {
    const onSelect = renderPicker({ selectedContractId: LEAPS.contractId })
    await userEvent.click(screen.getByRole('button', { name: 'Enter manually' }))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('choosing the placeholder option calls onSelect(null)', async () => {
    const onSelect = renderPicker({ selectedContractId: LEAPS.contractId })
    await userEvent.selectOptions(screen.getByLabelText('Contract'), '')
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('shows no notice for a fresh chain', () => {
    renderPicker({ selectedContractId: LEAPS.contractId })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([
    ['loading', chain({ status: 'pending', contracts: [] }), undefined],
    ['unavailable', chain({ status: 'error', contracts: [] }), undefined],
    ['empty', chain({ contracts: [] }), undefined],
    [
      'stale',
      chain({ contracts: [{ ...LEAPS, timestamp: '2026-09-11T20:00:00Z' }] }),
      LEAPS.contractId
    ]
  ] as const)(
    'renders the %s notice in a gold status box that never blocks the inputs',
    (kind, value, selectedContractId) => {
      renderPicker({ chain: value, selectedContractId })
      const notice = screen.getByRole('status')
      expect(notice).toHaveTextContent(CHAIN_NOTICE_COPY[kind])
      expect(notice).toHaveClass('bg-wb-gold-dim', 'text-wb-gold')
      expect(screen.getByLabelText('Contract')).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Enter manually' })).toBeEnabled()
    }
  )
})
