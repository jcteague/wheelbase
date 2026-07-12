import { parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import type { PositionListItem } from '../api/positions'
import {
  AGENDA_HORIZON_DAYS,
  BUSY_WEEK_THRESHOLD,
  CHIP_LIMIT,
  buildAgendaWeeks,
  buildMonthGrid,
  groupByExpiration,
  toCalendarEntries,
  visibleChips,
  type CalendarEntry
} from './expiration-calendar'

function makePosition(overrides: Partial<PositionListItem> = {}): PositionListItem {
  return {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    status: 'ACTIVE',
    strike: '180.00',
    expiration: '2026-08-14',
    dte: 6,
    instrumentType: 'PUT',
    contracts: 1,
    entryPremiumPerContract: '2.50',
    premium_collected: '250.0000',
    effective_cost_basis: '177.50',
    profitTargetPercent: null,
    ...overrides
  }
}

function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: 'entry-1',
    ticker: 'AAPL',
    phase: 'CSP_OPEN',
    strike: '180.00',
    dte: 6,
    expiration: '2026-08-14',
    ...overrides
  }
}

describe('toCalendarEntries', () => {
  it('keeps only ACTIVE positions with a non-null expiration', () => {
    const positions: PositionListItem[] = [
      makePosition({ id: 'active-option', status: 'ACTIVE', expiration: '2026-08-14' }),
      makePosition({
        id: 'holding-shares',
        phase: 'HOLDING_SHARES',
        status: 'ACTIVE',
        expiration: null,
        strike: null,
        dte: null,
        instrumentType: null
      }),
      makePosition({ id: 'closed', status: 'CLOSED', expiration: '2026-08-14' })
    ]

    const entries = toCalendarEntries(positions)

    expect(entries.map((e) => e.id)).toEqual(['active-option'])
  })

  it('maps PositionListItem fields onto CalendarEntry', () => {
    const positions: PositionListItem[] = [
      makePosition({
        id: 'pos-42',
        ticker: 'MSFT',
        phase: 'CC_OPEN',
        strike: '420.00',
        dte: 12,
        expiration: '2026-08-21'
      })
    ]

    const [entry] = toCalendarEntries(positions)

    expect(entry).toEqual({
      id: 'pos-42',
      ticker: 'MSFT',
      phase: 'CC_OPEN',
      strike: '420.00',
      dte: 12,
      expiration: '2026-08-21'
    })
  })
})

describe('groupByExpiration', () => {
  it('groups entries by ISO expiration date', () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: 'aapl', ticker: 'AAPL', expiration: '2026-08-14' }),
      makeEntry({ id: 'msft', ticker: 'MSFT', expiration: '2026-08-14' }),
      makeEntry({ id: 'tsla', ticker: 'TSLA', expiration: '2026-08-21' })
    ]

    const byDate = groupByExpiration(entries)

    expect(byDate.get('2026-08-14')).toHaveLength(2)
    expect(byDate.get('2026-08-21')).toHaveLength(1)
  })
})

describe('buildMonthGrid', () => {
  const august2026 = new Date(2026, 7, 1)

  it('returns a 6x7 grid of DayCell rows', () => {
    const grid = buildMonthGrid(august2026, new Map(), new Date(2026, 7, 10))

    expect(grid).toHaveLength(6)
    grid.forEach((row) => expect(row).toHaveLength(7))
  })

  it('flags leading/trailing spillover days with inMonth=false', () => {
    // August 2026 starts on a Saturday, so the grid's first row begins
    // Sunday 2026-07-26 with 6 leading spillover days from July.
    const grid = buildMonthGrid(august2026, new Map(), new Date(2026, 7, 10))
    const firstRow = grid[0]

    expect(firstRow.slice(0, 6).every((cell) => cell.inMonth === false)).toBe(true)
    expect(firstRow[6].inMonth).toBe(true)
    expect(firstRow[6].dayOfMonth).toBe(1)
  })

  it('marks the today cell with isToday=true', () => {
    const today = new Date(2026, 7, 10)
    const grid = buildMonthGrid(august2026, new Map(), today)

    const todayCells = grid.flat().filter((cell) => cell.isToday)

    expect(todayCells).toHaveLength(1)
    expect(todayCells[0].inMonth).toBe(true)
    expect(todayCells[0].dayOfMonth).toBe(10)
  })

  it('places entries on the matching in-month date cell', () => {
    const aapl = makeEntry({ id: 'aapl', ticker: 'AAPL', expiration: '2026-08-14' })
    const msft = makeEntry({ id: 'msft', ticker: 'MSFT', expiration: '2026-08-14' })
    const byDate = new Map([['2026-08-14', [aapl, msft]]])

    const grid = buildMonthGrid(august2026, byDate, new Date(2026, 7, 1))

    const targetCell = grid.flat().find((cell) => cell.inMonth && cell.dayOfMonth === 14)
    expect(targetCell?.entries).toEqual([aapl, msft])

    const otherCells = grid.flat().filter((cell) => cell !== targetCell)
    otherCells.forEach((cell) => expect(cell.entries).toEqual([]))
  })

  it('renders every cell even when no entries exist (empty month)', () => {
    const grid = buildMonthGrid(august2026, new Map(), new Date(2026, 7, 1))
    const cells = grid.flat()

    expect(cells).toHaveLength(42)
    cells.forEach((cell) => expect(cell.entries).toEqual([]))
  })
})

describe('buildAgendaWeeks', () => {
  const today = new Date(2026, 7, 10) // Monday 2026-08-10

  it('includes only expirations from today through today + horizonDays', () => {
    const past = makeEntry({ id: 'past', expiration: '2026-08-09' })
    const inWindow = makeEntry({ id: 'in-window', expiration: '2026-08-14' })
    const beyondHorizon = makeEntry({ id: 'beyond', expiration: '2026-09-15' })

    const weeks = buildAgendaWeeks([past, inWindow, beyondHorizon], today, 30)
    const ids = weeks.flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.id)))

    expect(ids).toEqual(['in-window'])
  })

  it('groups the in-window entries into ISO weeks, dropping weeks with no expirations', () => {
    const weekOneEntry = makeEntry({ id: 'week-one', expiration: '2026-08-11' })
    const weekThreeEntry = makeEntry({ id: 'week-three', expiration: '2026-08-25' })

    const weeks = buildAgendaWeeks([weekOneEntry, weekThreeEntry], today, 30)

    expect(weeks).toHaveLength(2)
    weeks.forEach((week) => expect(week.total).toBeGreaterThan(0))
  })

  it('sets isBusy=true when a week has >= BUSY_WEEK_THRESHOLD expirations', () => {
    const busyWeekEntries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ id: `busy-${i}`, expiration: '2026-08-21' })
    )
    const quietWeekEntries = [
      makeEntry({ id: 'quiet-1', expiration: '2026-08-11' }),
      makeEntry({ id: 'quiet-2', expiration: '2026-08-12' })
    ]

    const weeks = buildAgendaWeeks([...busyWeekEntries, ...quietWeekEntries], today, 30)

    const busyWeek = weeks.find((w) => w.total === 5)
    const quietWeek = weeks.find((w) => w.total === 2)

    expect(busyWeek?.isBusy).toBe(true)
    expect(quietWeek?.isBusy).toBe(false)
  })

  it('orders weeks chronologically and computes total per week', () => {
    const laterEntry = makeEntry({ id: 'later', expiration: '2026-08-25' })
    const earlierEntry = makeEntry({ id: 'earlier', expiration: '2026-08-11' })

    const weeks = buildAgendaWeeks([laterEntry, earlierEntry], today, 30)

    expect(weeks.map((w) => w.total)).toEqual([1, 1])
    expect(weeks[0].weekStart.getTime()).toBeLessThan(weeks[1].weekStart.getTime())
  })

  it('returns an empty array when nothing expires within the horizon', () => {
    const tooLate = makeEntry({ id: 'too-late', expiration: '2026-12-01' })

    const weeks = buildAgendaWeeks([tooLate], today, 30)

    expect(weeks).toEqual([])
  })

  it('includes an expiration that falls on today even when `today` carries a non-midnight time', () => {
    // A frozen `today` captured from `new Date()` mid-day should not exclude
    // same-day expirations, which `parseISO` always parses at local midnight.
    const todayWithTime = new Date(2026, 7, 10, 14, 30)
    const dueToday = makeEntry({ id: 'due-today', expiration: '2026-08-10' })

    const weeks = buildAgendaWeeks([dueToday], todayWithTime, 30)
    const ids = weeks.flatMap((w) => w.days.flatMap((d) => d.entries.map((e) => e.id)))

    expect(ids).toEqual(['due-today'])
  })

  it('includes the month on weekEnd in rangeLabel when the week spans a month boundary', () => {
    const july20 = new Date(2026, 6, 20)
    const boundaryEntry = makeEntry({ id: 'boundary', expiration: '2026-07-29' })

    const weeks = buildAgendaWeeks([boundaryEntry], july20, 30)

    expect(weeks[0].rangeLabel).toBe('Jul 26 – Aug 1')
  })

  it('omits the redundant month on weekEnd when the week stays within one month', () => {
    const weekOneEntry = makeEntry({ id: 'week-one', expiration: '2026-08-11' })

    const weeks = buildAgendaWeeks([weekOneEntry], today, 30)

    expect(weeks[0].rangeLabel).toBe('Aug 9 – 15')
  })
})

describe('visibleChips', () => {
  it('returns all entries and hiddenCount 0 when at or below the limit', () => {
    const entries = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' }), makeEntry({ id: 'c' })]

    const result = visibleChips(entries, CHIP_LIMIT)

    expect(result.visible).toEqual(entries)
    expect(result.hiddenCount).toBe(0)
  })

  it('caps visible at CHIP_LIMIT and reports the remainder as hiddenCount', () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry({ id: `entry-${i}` }))

    const result = visibleChips(entries, CHIP_LIMIT)

    expect(result.visible).toHaveLength(3)
    expect(result.hiddenCount).toBe(2)
  })
})

describe('constants', () => {
  it('exposes the documented default values', () => {
    expect(CHIP_LIMIT).toBe(3)
    expect(BUSY_WEEK_THRESHOLD).toBe(3)
    expect(AGENDA_HORIZON_DAYS).toBe(30)
  })
})

describe('date fixtures sanity', () => {
  it('confirms the August 2026 fixture assumptions', () => {
    expect(parseISO('2026-08-01').getUTCDay()).toBe(6) // Saturday
  })
})
