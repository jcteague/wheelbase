// [US-109] The leg timeline's coverage strip: the LEAPS bar with its roll tick, a segment per
// cycle and the valuation-date marker, on an axis from 2026-09-14 to the held LEAPS's
// 2028-01-21 expiration (494 days; expected placements are calendar days ÷ 494).
import { render, screen, within } from '@testing-library/react'
import { PmccCoverageStrip } from './PmccCoverageStrip'
import {
  LEAPS_ONLY_TIMELINE,
  XYZ_CLOSED_TIMELINE,
  XYZ_TIMELINE,
  XYZ_UNRECORDED_TIMELINE
} from './PmccLegTimeline.fixture'

function strip(): HTMLElement {
  return screen.getByRole('region', { name: 'Coverage' })
}

function segment(number: number): HTMLElement {
  return within(strip()).getByRole('img', { name: `Cycle ${number}` })
}

describe('PmccCoverageStrip', () => {
  it('captions the axis and states the covered and uncovered days', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    expect(within(strip()).getByText('Coverage · 2026-09-14 to 2028-01-21')).toBeInTheDocument()
    expect(within(strip()).getByText('covered 289 of 333 days · 44 uncovered')).toBeInTheDocument()
  })

  it('labels the LEAPS bar with the contract held now', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    expect(within(strip()).getByText('LEAPS $85.00 call · 2028-01-21')).toBeInTheDocument()
  })

  it('draws one segment per cycle, each named by its cycle', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    expect(
      within(strip())
        .getAllByRole('img', { name: /^Cycle \d+$/ })
        .map((element) => element.getAttribute('aria-label'))
    ).toEqual([
      'Cycle 1',
      'Cycle 2',
      'Cycle 3',
      'Cycle 4',
      'Cycle 5',
      'Cycle 6',
      'Cycle 7',
      'Cycle 8',
      'Cycle 9'
    ])
  })

  it('spans an ended cycle from its sale to the day it ended', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    // Cycle 5: 2027-03-15 (day 182) to its 2027-04-02 buyback (18 days), not its expiration.
    expect(segment(5).style.left).toBe('36.842%')
    expect(segment(5).style.width).toBe('3.644%')
  })

  it('spans the open cycle from its sale to the valuation date', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    // Cycle 9: 2027-07-23 (day 312) to 2027-08-13 (21 days).
    expect(segment(9).style.left).toBe('63.158%')
    expect(segment(9).style.width).toBe('4.251%')
  })

  it('colours ended cycles green and the open cycle gold', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    expect(segment(1)).toHaveClass('bg-wb-green/20')
    expect(segment(9)).toHaveClass('bg-wb-gold-dim')
  })

  it('colours an assigned cycle red', () => {
    render(<PmccCoverageStrip timeline={XYZ_CLOSED_TIMELINE} />)
    expect(segment(9)).toHaveClass('bg-wb-red/30')
    expect(segment(8)).toHaveClass('bg-wb-green/20')
  })

  it('ends a cycle with no recorded outcome at its expiration, not the valuation date', () => {
    render(<PmccCoverageStrip timeline={XYZ_UNRECORDED_TIMELINE} />)
    expect(within(strip()).getByText('today 2027-08-24')).toBeInTheDocument()
    // Cycle 9: 2027-07-23 (day 312) to its 2027-08-20 expiration (28 days), not 2027-08-24 (32).
    expect(segment(9).style.left).toBe('63.158%')
    expect(segment(9).style.width).toBe('5.668%')
  })

  it('colours a cycle with no recorded outcome neutral, not gold, green or red', () => {
    render(<PmccCoverageStrip timeline={XYZ_UNRECORDED_TIMELINE} />)
    expect(segment(8)).toHaveClass('bg-wb-green/20')
    expect(segment(9)).toHaveClass('bg-wb-text-muted/20')
    expect(segment(9).className).not.toMatch(/wb-(gold|green|red)/)
  })

  it('ticks the LEAPS bar once per LEAPS roll, on the roll date', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    const ticks = within(strip()).getAllByRole('img', { name: /^LEAPS roll/ })
    expect(ticks.map((tick) => tick.getAttribute('aria-label'))).toEqual([
      'LEAPS roll · 2027-07-09'
    ])
    // 2027-07-09 is day 298.
    expect(ticks[0].style.left).toBe('60.324%')
  })

  it('marks the valuation date as today', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    expect(within(strip()).getByText('today 2027-08-13')).toBeInTheDocument()
  })

  it('says no short call has been sold when there are no cycles', () => {
    render(<PmccCoverageStrip timeline={LEAPS_ONLY_TIMELINE} />)
    expect(
      within(strip()).getByText('no short call has been sold against this LEAPS')
    ).toBeInTheDocument()
    expect(within(strip()).getByText('covered 0 of 73 days · 73 uncovered')).toBeInTheDocument()
    expect(within(strip()).queryAllByRole('img', { name: /^Cycle/ })).toHaveLength(0)
  })

  it('does not say no short call has been sold when cycles exist', () => {
    render(<PmccCoverageStrip timeline={XYZ_TIMELINE} />)
    expect(segment(1)).toBeInTheDocument()
    expect(
      within(strip()).queryByText('no short call has been sold against this LEAPS')
    ).not.toBeInTheDocument()
  })
})
