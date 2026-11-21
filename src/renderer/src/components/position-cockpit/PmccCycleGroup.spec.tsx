// [US-109] One short-call cycle of the leg timeline: header, net, rows (a roll stays inside its
// cycle), the coverage flag and the running basis after it.
import { render, screen, within } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { PmccCycle, PmccCycleRow } from '../../../../main/core/pmcc-timeline'
import { PmccCycleGroup } from './PmccCycleGroup'
import { XYZ_CYCLE_9_ASSIGNED, XYZ_CYCLE_9_UNRECORDED, xyzCycle } from './PmccLegTimeline.fixture'

function renderCycle(cycle: PmccCycle): HTMLElement {
  render(<PmccCycleGroup cycle={cycle} />)
  return screen.getByRole('region', { name: `Cycle ${cycle.number}` })
}

function rows(group: HTMLElement): HTMLElement[] {
  return within(group).getAllByRole('row')
}

function cellTexts(row: HTMLElement): (string | null)[] {
  return within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent)
}

/** `cycle` with its opening row's fee replaced. */
function withOpeningFee(cycle: PmccCycle, fees: string): PmccCycle {
  return {
    ...cycle,
    rows: cycle.rows.map((row): PmccCycleRow => (row.kind === 'OPEN' ? { ...row, fees } : row))
  }
}

/** React's development warning for two siblings sharing a key, from every console.error call. */
function duplicateKeyWarnings(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter((args) => String(args[0]).includes('two children with the same key'))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PmccCycleGroup', () => {
  describe('two rolls of one cycle on the same day', () => {
    /** Cycle 2 rolled twice on 2026-11-06: $108 → $112, then $112 → $115. */
    const rolledTwice: PmccCycle = {
      ...xyzCycle(2),
      rollCount: 2,
      rows: [
        ...xyzCycle(2).rows.slice(0, 2),
        {
          kind: 'ROLL',
          number: 2,
          date: '2026-11-06',
          from: { strike: '112.0000', expiration: '2026-12-18', pricePerShare: '2.5000' },
          to: { strike: '115.0000', expiration: '2027-01-15', pricePerShare: '2.9000' },
          net: { direction: 'credit', perShare: '0.4000', total: '40.0000' },
          fees: '0.0000'
        },
        ...xyzCycle(2).rows.slice(2)
      ]
    }

    it('renders both rolls, each with its own contracts, and React logs no duplicate key', () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const group = renderCycle(rolledTwice)
      expect(rows(group).map((row) => cellTexts(row).slice(0, 3))).toEqual([
        ['Sell to open', '2026-10-23', '$108.00 call · 2026-11-20'],
        ['Roll #1', '2026-11-06', '$108.00 2026-11-20 → $112.00 2026-12-18'],
        ['Roll #2', '2026-11-06', '$112.00 2026-12-18 → $115.00 2027-01-15'],
        ['Expired worthless', '2026-12-18', '$112.00 call · 2026-12-18']
      ])
      expect(duplicateKeyWarnings(errors)).toEqual([])
    })
  })

  describe('a rolled cycle that expired (cycle 2)', () => {
    it('heads the group with the cycle number and its contract, DTE at sale and days held', () => {
      renderCycle(xyzCycle(2))
      expect(screen.getByRole('heading', { name: 'Cycle 2' })).toBeInTheDocument()
      expect(
        screen.getByText('$112.00 call · sold 2026-10-23 at 28 DTE · 56 days held')
      ).toBeInTheDocument()
    })

    it('marks the outcome and the roll count in the header', () => {
      renderCycle(xyzCycle(2))
      // One in the header, one on the terminal row.
      expect(screen.getAllByText('Expired worthless')).toHaveLength(2)
      expect(screen.getByText('1 roll')).toBeInTheDocument()
    })

    it('reads the cycle net after the roll debit, in green', () => {
      renderCycle(xyzCycle(2))
      expect(screen.getByText('Net credit')).toBeInTheDocument()
      expect(screen.getByText('+$1.20 / share (+$120.00)')).toHaveClass('text-wb-green')
    })

    it('keeps the roll inside the cycle: exactly the sale, the roll and the expiration', () => {
      const group = renderCycle(xyzCycle(2))
      expect(rows(group).map((row) => cellTexts(row)[0])).toEqual([
        'Sell to open',
        'Roll #1',
        'Expired worthless'
      ])
    })

    it('reads the sale to open as a signed credit', () => {
      const group = renderCycle(xyzCycle(2))
      expect(cellTexts(rows(group)[0])).toEqual([
        'Sell to open',
        '2026-10-23',
        '$108.00 call · 2026-11-20',
        '+$1.80',
        '+$180.00'
      ])
    })

    it('reads the roll as one row with its net debit, in gold', () => {
      const group = renderCycle(xyzCycle(2))
      expect(cellTexts(rows(group)[1])).toEqual([
        'Roll #1',
        '2026-11-06',
        '$108.00 2026-11-20 → $112.00 2026-12-18',
        'buy $3.00 / sell $2.40',
        'Net debit $0.60 ($60.00)'
      ])
      expect(screen.getByText('Net debit $0.60 ($60.00)')).toHaveClass('text-wb-gold')
    })

    it('reads the expiration with no cash', () => {
      const group = renderCycle(xyzCycle(2))
      expect(cellTexts(rows(group)[2])).toEqual([
        'Expired worthless',
        '2026-12-18',
        '$112.00 call · 2026-12-18',
        'expired worthless',
        '—'
      ])
    })

    it('footers the group with the US-103 basis after the cycle', () => {
      renderCycle(xyzCycle(2))
      expect(screen.getByText('PMCC cost basis after cycle 2')).toBeInTheDocument()
      expect(screen.getByText('$21.80 / share')).toBeInTheDocument()
      expect(screen.getByText('from the US-103 ledger')).toBeInTheDocument()
    })

    it('colours an ended outcome green', () => {
      renderCycle(xyzCycle(2))
      screen
        .getAllByText('Expired worthless')
        .forEach((badge) => expect(badge).toHaveClass('text-wb-green'))
    })
  })

  describe('the roll badge tint', () => {
    /** Cycle 2 with its roll's net turned into a $0.40 credit. */
    const creditRoll: PmccCycle = {
      ...xyzCycle(2),
      rows: xyzCycle(2).rows.map(
        (row): PmccCycleRow =>
          row.kind === 'ROLL'
            ? { ...row, net: { direction: 'credit', perShare: '0.4000', total: '40.0000' } }
            : row
      )
    }

    it('tints the roll badge gold when the roll is a net debit', () => {
      renderCycle(xyzCycle(2))
      expect(screen.getByText('Roll #1')).toHaveStyle({ color: '#e6a817' })
    })

    it('tints the roll badge green and reads the net in green when the roll is a net credit', () => {
      renderCycle(creditRoll)
      expect(screen.getByText('Net credit $0.40 ($40.00)')).toHaveClass('text-wb-green')
      expect(screen.getByText('Roll #1')).toHaveStyle({ color: '#3fb950' })
    })
  })

  describe('a cycle bought back early (cycle 5)', () => {
    it('reads Closed early and nets the buyback against the credit', () => {
      const group = renderCycle(xyzCycle(5))
      expect(screen.getAllByText('Closed early')).toHaveLength(2)
      expect(screen.getByText('+$1.65 / share (+$165.00)')).toBeInTheDocument()
      expect(cellTexts(rows(group)[1])).toEqual([
        'Closed early',
        '2027-04-02',
        '$114.00 call · 2027-04-16',
        '−$0.55',
        '−$55.00'
      ])
    })

    it('shows no roll marker on an unrolled cycle', () => {
      renderCycle(xyzCycle(5))
      expect(screen.getByRole('heading', { name: 'Cycle 5' })).toBeInTheDocument()
      expect(screen.queryByText(/^\d+ rolls?$/)).not.toBeInTheDocument()
    })
  })

  describe('the open cycle (cycle 9)', () => {
    it('counts its days so far, never days held', () => {
      renderCycle(xyzCycle(9))
      expect(
        screen.getByText('$118.00 call · sold 2027-07-23 at 28 DTE · 21 days so far')
      ).toBeInTheDocument()
      expect(screen.queryByText(/days held/)).not.toBeInTheDocument()
    })

    it('is badged Open in gold', () => {
      renderCycle(xyzCycle(9))
      const badges = screen.getAllByText('Open')
      expect(badges).toHaveLength(2)
      badges.forEach((badge) => expect(badge).toHaveClass('text-wb-gold'))
    })

    it('labels its net as open, not realized', () => {
      renderCycle(xyzCycle(9))
      expect(screen.getByText('Net credit, open')).toBeInTheDocument()
      expect(screen.queryByText('Net credit')).not.toBeInTheDocument()
      expect(screen.getByText('+$1.95 / share (+$195.00)')).toBeInTheDocument()
    })

    it('ends with an open row stating the credit is not realized', () => {
      const group = renderCycle(xyzCycle(9))
      expect(rows(group)).toHaveLength(2)
      expect(cellTexts(rows(group)[1])).toEqual([
        'Open',
        '—',
        '7 DTE remaining · credit collected, not realized'
      ])
    })
  })

  describe('a short call past its expiration with no recorded outcome (cycle 9 at 2027-08-24)', () => {
    it('counts its days held to the expiration, never days so far', () => {
      renderCycle(XYZ_CYCLE_9_UNRECORDED)
      expect(
        screen.getByText('$118.00 call · sold 2027-07-23 at 28 DTE · 28 days held')
      ).toBeInTheDocument()
      expect(screen.queryByText(/so far/)).not.toBeInTheDocument()
    })

    it('is badged Outcome not recorded in the neutral style, not open and not an outcome colour', () => {
      renderCycle(XYZ_CYCLE_9_UNRECORDED)
      const badges = screen.getAllByText('Outcome not recorded')
      expect(badges).toHaveLength(2)
      badges.forEach((badge) => {
        expect(badge).toHaveClass('text-wb-text-muted')
        expect(badge).not.toHaveClass('text-wb-red', 'text-wb-gold', 'text-wb-green')
        expect(badge).toHaveStyle({ color: '#484f58' })
      })
      expect(screen.queryByText('Open', { exact: true })).not.toBeInTheDocument()
    })

    it('keeps its net labelled open: the credit is not realized until the outcome is recorded', () => {
      renderCycle(XYZ_CYCLE_9_UNRECORDED)
      expect(screen.getByText('Net credit, open')).toBeInTheDocument()
      expect(screen.getByText('+$1.95 / share (+$195.00)')).toBeInTheDocument()
    })

    it('ends with a row stating the expiration and no recorded outcome, and no DTE remaining', () => {
      const group = renderCycle(XYZ_CYCLE_9_UNRECORDED)
      expect(rows(group)).toHaveLength(2)
      expect(cellTexts(rows(group)[1])).toEqual([
        'Outcome not recorded',
        '—',
        'Expired 2027-08-20 · outcome not recorded'
      ])
      expect(screen.queryByText(/DTE remaining/)).not.toBeInTheDocument()
    })
  })

  describe('a cycle ended by assignment', () => {
    it('badges Assigned in the loss colour', () => {
      renderCycle(XYZ_CYCLE_9_ASSIGNED)
      const badges = screen.getAllByText('Assigned')
      expect(badges).toHaveLength(2)
      badges.forEach((badge) => expect(badge).toHaveClass('text-wb-red'))
    })

    it('leaves the settlement to US-111 on the terminal row', () => {
      const group = renderCycle(XYZ_CYCLE_9_ASSIGNED)
      expect(cellTexts(rows(group)[1])).toEqual([
        'Assigned',
        '2027-08-20',
        '$118.00 call · 2027-08-20',
        '— (assigned)',
        'settlement recorded by US-111'
      ])
    })

    it('labels its net as a closed credit, no longer open', () => {
      renderCycle(XYZ_CYCLE_9_ASSIGNED)
      expect(screen.getByText('Net credit')).toBeInTheDocument()
      expect(screen.queryByText('Net credit, open')).not.toBeInTheDocument()
    })
  })

  describe('a leg role the timeline does not know', () => {
    const withUnknown: PmccCycle = {
      ...xyzCycle(9),
      rows: [...xyzCycle(9).rows, { kind: 'UNKNOWN', date: '2027-08-04', role: 'CC_CLOSE' }]
    }

    it('renders the raw role and its date, muted, inside the cycle', () => {
      const group = renderCycle(withUnknown)
      const row = rows(group)[1]
      expect(within(row).getByText('CC_CLOSE')).toHaveClass('text-wb-text-muted')
      expect(within(row).getByText('2027-08-04')).toHaveClass('text-wb-text-muted')
    })

    it('leaves the cycle net unchanged', () => {
      renderCycle(withUnknown)
      expect(screen.getByText('+$1.95 / share (+$195.00)')).toBeInTheDocument()
    })
  })

  describe('a short call that outlasts the LEAPS', () => {
    const flagged: PmccCycle = {
      ...xyzCycle(9),
      flag: { daysPastLeaps: 29, leapsExpiration: '2027-09-17' }
    }
    const FLAG =
      'This short expires 29 days after the open LEAPS (2027-09-17). It was uncovered for that stretch.'

    it('annotates the cycle in red with the flag sentence and US-102', () => {
      renderCycle(flagged)
      expect(screen.getByText(FLAG)).toBeInTheDocument()
      expect(screen.getByText(FLAG).closest('.text-wb-red')).not.toBeNull()
      expect(screen.getByText(/US-102/)).toBeInTheDocument()
    })

    it('shows no flag on an unflagged cycle', () => {
      renderCycle(xyzCycle(2))
      expect(screen.getByRole('heading', { name: 'Cycle 2' })).toBeInTheDocument()
      expect(screen.queryByText(/uncovered for that stretch/)).not.toBeInTheDocument()
      expect(screen.queryByText(/US-102/)).not.toBeInTheDocument()
    })
  })

  describe('fees', () => {
    it('appends a fee to the sale-to-open total', () => {
      const group = renderCycle(withOpeningFee(xyzCycle(1), '1.0000'))
      expect(cellTexts(rows(group)[0])[4]).toBe('+$200.00 · fees $1.00')
    })

    it('shows no fees text when the fee is zero', () => {
      const group = renderCycle(xyzCycle(1))
      expect(cellTexts(rows(group)[0])[4]).toBe('+$200.00')
      expect(screen.queryByText(/fees/)).not.toBeInTheDocument()
    })
  })

  it('colours a negative cycle net gold with the U+2212 minus', () => {
    renderCycle({ ...xyzCycle(5), netPerShare: '-0.4000', netTotal: '-40.0000' })
    expect(screen.getByText('−$0.40 / share (−$40.00)')).toHaveClass('text-wb-gold')
  })
})
