// [US-109] The leg timeline's LEAPS track: the purchase opens coverage and a LEAPS roll reads as
// one unbroken row, with the running basis after each.
import { render, screen, within } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { PmccLeapsRow } from '../../../../main/core/pmcc-timeline'
import { PmccLeapsTrack } from './PmccLeapsTrack'
import { XYZ_TIMELINE } from './PmccLegTimeline.fixture'

const SOLD_TO_CLOSE: PmccLeapsRow = {
  kind: 'CLOSE',
  date: '2027-08-20',
  contract: { strike: '85.0000', expiration: '2028-01-21', pricePerShare: '24.1000' },
  total: '2410.0000',
  fees: '0.0000'
}

const UNKNOWN_LEAPS_ROW: PmccLeapsRow = {
  kind: 'UNKNOWN',
  date: '2027-08-04',
  role: 'LEAPS_ADJUST'
}

function renderTrack(rows: PmccLeapsRow[] = XYZ_TIMELINE.leapsTrack.rows): void {
  render(<PmccLeapsTrack closedDate={null} leapsTrack={{ ...XYZ_TIMELINE.leapsTrack, rows }} />)
}

/** The track's body rows, below its column-header row. */
function bodyRows(): HTMLElement[] {
  const region = screen.getByRole('region', { name: 'LEAPS track' })
  return within(region).getAllByRole('row').slice(1)
}

function cellTexts(row: HTMLElement): (string | null)[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

/** React's development warning for two siblings sharing a key, from every console.error call. */
function duplicateKeyWarnings(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter((args) => String(args[0]).includes('two children with the same key'))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PmccLeapsTrack', () => {
  it('renders two unknown legs dated the same day as two rows, and React logs no duplicate key', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderTrack([
      ...XYZ_TIMELINE.leapsTrack.rows,
      UNKNOWN_LEAPS_ROW,
      { kind: 'UNKNOWN', date: '2027-08-04', role: 'SHORT_END' }
    ])
    expect(bodyRows().map((row) => cellTexts(row).slice(0, 2))).toEqual([
      ['Buy LEAPS', '2026-09-14'],
      ['LEAPS roll #1', '2027-07-09'],
      ['LEAPS_ADJUST', '2027-08-04'],
      ['SHORT_END', '2027-08-04']
    ])
    expect(duplicateKeyWarnings(errors)).toEqual([])
  })

  it('heads the panel LEAPS track with the open LEAPS and its cost to date', () => {
    renderTrack()
    expect(screen.getByRole('heading', { name: 'LEAPS track' })).toBeInTheDocument()
    expect(
      screen.getByText('open $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share')
    ).toBeInTheDocument()
  })

  it('reads closed in the header once the position has closed', () => {
    render(<PmccLeapsTrack closedDate="2027-08-20" leapsTrack={XYZ_TIMELINE.leapsTrack} />)
    expect(
      screen.getByText('closed $85.00 call · 2028-01-21 · LEAPS cost to date $22.50 / share')
    ).toBeInTheDocument()
  })

  it('has the Event, Date, Contract, Price / share, Net, Coverage and Basis after columns', () => {
    renderTrack()
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
      'Event',
      'Date',
      'Contract',
      'Price / share',
      'Net',
      'Coverage',
      'Basis after'
    ])
  })

  it('shows exactly the purchase and the roll', () => {
    renderTrack()
    expect(bodyRows()).toHaveLength(2)
  })

  it('reads the purchase as opening coverage, with the basis after it', () => {
    renderTrack()
    expect(cellTexts(bodyRows()[0])).toEqual([
      'Buy LEAPS',
      '2026-09-14',
      '$80.00 call · 2027-09-17',
      '−$25.00',
      '−$2,500.00',
      'opens coverage · 368 DTE at fill',
      '$25.00'
    ])
  })

  it('reads the LEAPS roll as one unbroken row, with the basis after it', () => {
    renderTrack()
    expect(cellTexts(bodyRows()[1])).toEqual([
      'LEAPS roll #1',
      '2027-07-09',
      '$80.00 2027-09-17 → $85.00 2028-01-21',
      'sell $26.00 / buy $23.50',
      'Net credit $2.50 ($250.00)',
      'unbroken · +126 days',
      '$8.50'
    ])
  })

  it('colours a credit roll net green', () => {
    renderTrack()
    expect(screen.getByText('Net credit $2.50 ($250.00)')).toHaveClass('text-wb-green')
  })

  it('colours a debit roll net gold', () => {
    const [purchase, roll] = XYZ_TIMELINE.leapsTrack.rows
    if (roll.kind !== 'ROLL') throw new Error('fixture: second LEAPS row is not a roll')
    renderTrack([
      purchase,
      { ...roll, net: { direction: 'debit', perShare: '0.4000', total: '40.0000' } }
    ])
    expect(screen.getByText('Net debit $0.40 ($40.00)')).toHaveClass('text-wb-gold')
  })

  it('reads a sale to close with no basis after it', () => {
    renderTrack([...XYZ_TIMELINE.leapsTrack.rows, SOLD_TO_CLOSE])
    const cells = cellTexts(bodyRows()[2])
    expect(cells[0]).toBe('Sold to close')
    expect(cells[1]).toBe('2027-08-20')
    expect(cells[3]).toBe('+$24.10')
    expect(cells[6]).toBe('—')
  })

  it('renders a role it does not know by its raw name and date, muted', () => {
    renderTrack([...XYZ_TIMELINE.leapsTrack.rows, UNKNOWN_LEAPS_ROW])
    const row = bodyRows()[2]
    expect(within(row).getByText('LEAPS_ADJUST')).toHaveClass('text-wb-text-muted')
    expect(within(row).getByText('2027-08-04')).toHaveClass('text-wb-text-muted')
  })
})
