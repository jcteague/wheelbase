// [US-109] The Leg timeline drawer, expanded: the coverage strip, then the LEAPS track and the
// short-call cycles as two separate panels, with each uncovered stretch as a neutral gap row.
import { fireEvent, render, screen, within, type RenderResult } from '@testing-library/react'
import type { PmccCycle, PmccTimeline } from '../../../../main/core/pmcc-timeline'
import { PmccLegTimeline } from './PmccLegTimeline'
import {
  LEAPS_ONLY_TIMELINE,
  XYZ_CLOSED_TIMELINE,
  XYZ_CYCLE_9_ASSIGNED,
  XYZ_TIMELINE,
  XYZ_UNRECORDED_TIMELINE
} from './PmccLegTimeline.fixture'

/** Renders the drawer and expands it: every body assertion reads the open drawer. */
function renderOpen(timeline: PmccTimeline): RenderResult {
  const result = render(<PmccLegTimeline timeline={timeline} />)
  fireEvent.click(screen.getByRole('button', { name: /Leg timeline/ }))
  return result
}

const isBefore = (a: Node, b: Node): boolean =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

function cycleRegion(number: number): HTMLElement {
  return screen.getByRole('region', { name: `Cycle ${number}` })
}

/** Every gap row's text element, in document order. */
function gapRows(): HTMLElement[] {
  return screen.queryAllByText(/^Uncovered · /)
}

/** The gap rows that sit after cycle `a` and before cycle `b`. */
function gapsBetween(a: number, b: number): HTMLElement[] {
  return gapRows().filter((gap) => isBefore(cycleRegion(a), gap) && isBefore(gap, cycleRegion(b)))
}

describe('PmccLegTimeline', () => {
  it('captions the drawer body with its owner', () => {
    renderOpen(XYZ_TIMELINE)
    expect(screen.getByText('US-109 · a roll stays inside its cycle')).toBeInTheDocument()
  })

  it('shows the coverage strip, then the LEAPS track, then a separate short-call cycles panel', () => {
    renderOpen(XYZ_TIMELINE)
    const coverage = screen.getByRole('region', { name: 'Coverage' })
    const leaps = screen.getByRole('region', { name: 'LEAPS track' })
    const cycles = screen.getByRole('region', { name: 'Short-call cycles' })
    expect(isBefore(coverage, leaps)).toBe(true)
    expect(isBefore(leaps, cycles)).toBe(true)
    expect(leaps.contains(cycles)).toBe(false)
  })

  it('heads the cycles panel with the cycle counts', () => {
    renderOpen(XYZ_TIMELINE)
    const cycles = screen.getByRole('region', { name: 'Short-call cycles' })
    expect(within(cycles).getByText('9 cycles · 8 closed · 1 open')).toBeInTheDocument()
  })

  it('lists the nine cycles in order inside the cycles panel', () => {
    renderOpen(XYZ_TIMELINE)
    const cycles = screen.getByRole('region', { name: 'Short-call cycles' })
    expect(
      within(cycles)
        .getAllByRole('heading', { name: /^Cycle \d+$/ })
        .map((heading) => heading.textContent)
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

  it('states the 7-day uncovered stretch between cycles 1 and 2', () => {
    renderOpen(XYZ_TIMELINE)
    const [gap] = gapsBetween(1, 2)
    expect(gap).toHaveTextContent(
      'Uncovered · 7 days · 2026-10-16 to 2026-10-23 — no short call open against the LEAPS'
    )
  })

  it('states the 17-day uncovered stretch between cycles 2 and 3', () => {
    renderOpen(XYZ_TIMELINE)
    expect(gapsBetween(2, 3).map((gap) => gap.textContent)).toEqual([
      'Uncovered · 17 days · 2026-12-18 to 2027-01-04 — no short call open against the LEAPS'
    ])
  })

  it('shows no gap row between back-to-back cycles 6 and 7', () => {
    renderOpen(XYZ_TIMELINE)
    expect(gapRows()).toHaveLength(7)
    expect(gapsBetween(6, 7)).toHaveLength(0)
  })

  it('states a gap as a neutral fact: muted and dashed, no warning role or colour', () => {
    renderOpen(XYZ_TIMELINE)
    const [gap] = gapsBetween(1, 2)
    const row = gap.parentElement
    if (!row) throw new Error('gap text has no row')
    expect(row).toHaveClass('border-dashed')
    expect(gap).toHaveClass('text-wb-text-muted')
    expect(row.outerHTML).not.toMatch(/wb-red|wb-gold/)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('states a leading gap before the first cycle', () => {
    const leading: PmccTimeline = {
      ...XYZ_TIMELINE,
      start: '2026-09-07',
      gaps: [
        { kind: 'LEADING', beforeCycle: 1, from: '2026-09-07', to: '2026-09-14', days: 7 },
        ...XYZ_TIMELINE.gaps
      ]
    }
    renderOpen(leading)
    const [first] = gapRows()
    expect(first).toHaveTextContent('Uncovered · 7 days · 2026-09-07 to 2026-09-14')
    expect(isBefore(first, cycleRegion(1))).toBe(true)
  })

  it('states a trailing gap after the last ended cycle', () => {
    const cycles: PmccCycle[] = [...XYZ_TIMELINE.cycles.slice(0, 8), XYZ_CYCLE_9_ASSIGNED]
    const trailing: PmccTimeline = {
      ...XYZ_TIMELINE,
      valuationDate: '2027-09-02',
      windowEnd: '2027-09-02',
      cycles,
      gaps: [
        ...XYZ_TIMELINE.gaps,
        { kind: 'TRAILING', afterCycle: 9, from: '2027-08-20', to: '2027-09-02', days: 13 }
      ]
    }
    renderOpen(trailing)
    const last = gapRows().at(-1)
    if (!last) throw new Error('no gap rows')
    expect(last).toHaveTextContent('Uncovered · 13 days · 2027-08-20 to 2027-09-02')
    expect(isBefore(cycleRegion(9), last)).toBe(true)
  })

  it('states the stretch after a short that expired with no recorded outcome as uncovered', () => {
    renderOpen(XYZ_UNRECORDED_TIMELINE)
    expect(within(cycleRegion(9)).getAllByText('Outcome not recorded')).toHaveLength(2)
    const last = gapRows().at(-1)
    if (!last) throw new Error('no gap rows')
    expect(last).toHaveTextContent(
      'Uncovered · 4 days · 2027-08-20 to 2027-08-24 — no short call open against the LEAPS'
    )
    expect(isBefore(cycleRegion(9), last)).toBe(true)
  })

  it('shows the empty state, and no cycle or gap row, when no short call was ever sold', () => {
    renderOpen(LEAPS_ONLY_TIMELINE)
    const cycles = screen.getByRole('region', { name: 'Short-call cycles' })
    expect(
      within(cycles).getByText(
        'No short call has been sold against this LEAPS yet. The LEAPS track above is the whole history.'
      )
    ).toBeInTheDocument()
    expect(within(cycles).queryAllByRole('heading', { name: /^Cycle/ })).toHaveLength(0)
    expect(gapRows()).toHaveLength(0)
  })

  it('shows no empty state when cycles exist', () => {
    renderOpen(XYZ_TIMELINE)
    expect(cycleRegion(1)).toBeInTheDocument()
    expect(screen.queryByText(/^No short call has been sold/)).not.toBeInTheDocument()
  })

  it('banners a closed position and mutes the completed timeline', () => {
    renderOpen(XYZ_CLOSED_TIMELINE)
    const banner = screen.getByText('Position closed 2027-08-20 · the timeline is complete')
    const leaps = screen.getByRole('region', { name: 'LEAPS track' })
    expect(leaps.closest('.opacity-70')).not.toBeNull()
    expect(banner.closest('.opacity-70')).toBeNull()
  })

  it('shows no banner and no muting while the position is open', () => {
    renderOpen(XYZ_TIMELINE)
    const leaps = screen.getByRole('region', { name: 'LEAPS track' })
    expect(leaps.closest('.opacity-70')).toBeNull()
    expect(screen.queryByText(/^Position closed/)).not.toBeInTheDocument()
  })

  it('has no Role or Action column', () => {
    renderOpen(XYZ_TIMELINE)
    expect(screen.getByRole('columnheader', { name: 'Event' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Role' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Action' })).not.toBeInTheDocument()
  })

  it('shows no percentage or annualized return', () => {
    const { container } = renderOpen(XYZ_TIMELINE)
    expect(screen.getAllByRole('heading', { name: /^Cycle \d+$/ })).toHaveLength(9)
    expect(container.textContent).not.toMatch(/%|annualized/i)
  })
})
