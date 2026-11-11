// [US-108] The PMCC position card: the OPT-16 card face, action strip, leg highlights,
// awareness tags, footer and recovery meter, tier 2, and the closed and neutral cards, rendered
// from the Background fixtures with the clock pinned to the 2026-11-06 valuation date.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OptionSnapshot } from '../../api/market-data'
import type { PmccListItem } from '../../api/positions'
import { toPmccListPhase } from '../../../../main/pmcc-phase'
import {
  XYZ_BACKGROUND,
  XYZ_LEAPS_LEG,
  XYZ_LEAPS_ONLY,
  XYZ_LEAPS_SNAPSHOT,
  XYZ_PAID_FOR,
  XYZ_PARTIAL_COVERAGE,
  XYZ_SHORT_LEG,
  XYZ_SHORT_SNAPSHOT,
  XYZ_THREE_CONTRACTS,
  XYZ_TWO_SHORTS,
  optionSnapshot,
  pmccSnapshots,
  xyzQuote
} from '../../test-fixtures/wheel-cards'
import { PmccCard, type PmccCardProps } from './PmccCard'

type SnapshotsByLegId = Record<string, OptionSnapshot>

const BG_SNAPSHOTS: SnapshotsByLegId = {
  'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
  'xyz-short': XYZ_SHORT_SNAPSHOT
}

/** OPT-16 "falling stock": XYZ at $92.00, the LEAPS $16.10 × $16.70, the short $0.15 × $0.25. */
const FALLING_SNAPSHOTS: SnapshotsByLegId = {
  'xyz-leaps': optionSnapshot('16.10', '16.70', '16.40', '0.7000'),
  'xyz-short': optionSnapshot('0.15', '0.25', '0.20', '0.0500')
}

const MANAGEMENT_WINDOW_LINE = '◷ MANAGEMENT WINDOW · 14 DTE remaining — review for roll or close'
const DETAIL_BAR = /Detail · breakeven · max if called · Δ · extrinsic/
const LEG_TAG_TOOLTIP = /^(LEAPS — long call, the synthetic stock|Short call — the income leg)$/

function withLegs(item: PmccListItem, legs: PmccListItem['pmcc']['legs']): PmccListItem {
  return { ...item, pmcc: { ...item.pmcc, legs } }
}

function renderCard(
  item: PmccListItem = XYZ_BACKGROUND,
  byLegId: SnapshotsByLegId = BG_SNAPSHOTS,
  price: string | null = '104.20',
  props: Partial<PmccCardProps> = {}
): ReturnType<typeof render> {
  return render(
    <PmccCard
      item={item}
      snapshots={pmccSnapshots(item, byLegId)}
      quote={price === null ? undefined : xyzQuote(price)}
      session="regular"
      {...props}
    />
  )
}

/** The leg blocks in render order, each found by its L / S tag's tooltip. */
function legBlocks(): HTMLElement[] {
  return screen.getAllByTitle(LEG_TAG_TOOLTIP).map((tag) => {
    if (tag.parentElement === null) throw new Error('a leg tag outside its block')
    return tag.parentElement
  })
}

function footerCell(label: string): HTMLElement {
  const cell = screen.getByText(label).parentElement
  if (cell === null) throw new Error(`no footer cell ${label}`)
  return cell
}

/** The P&L figure and percent line under the position line's eyebrow. */
function pnl(): HTMLElement {
  const figure = screen.getByText('Net P&L · marked against basis').nextElementSibling
  if (!(figure instanceof HTMLElement)) throw new Error('no P&L figure')
  return figure
}

/** The header's price block, which sits just before the `Open ↗` link. */
function price(): HTMLElement {
  const block = screen.getByRole('link', { name: 'Open ↗' }).previousElementSibling
  if (!(block instanceof HTMLElement)) throw new Error('no price block')
  return block
}

/** The awareness tags (⚑ δ ⚠) are the card's only images. */
function awarenessTags(): HTMLElement[] {
  return screen.queryAllByRole('img')
}

function tier2Cells(): HTMLElement[] {
  const panel = screen.queryByRole('list', { name: 'Position detail' })
  return panel === null ? [] : within(panel).getAllByRole('listitem')
}

function detailBar(): HTMLElement {
  return screen.getByRole('button', { name: DETAIL_BAR })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 6, 10, 0, 0))
})

afterEach(() => {
  vi.useRealTimers()
  window.location.hash = ''
})

describe('PmccCard — the card face', () => {
  it('carries the PMCC badge and state, never a wheel phase badge', () => {
    renderCard()

    expect(screen.getByText('PMCC')).toBeInTheDocument()
    expect(screen.getByText('LEAPS + short call open')).toBeInTheDocument()
    expect(screen.queryByText('CC Open')).not.toBeInTheDocument()
    expect(screen.queryByText('CSP Open')).not.toBeInTheDocument()
    expect(screen.queryByText('Sell Call')).not.toBeInTheDocument()
  })

  it('shows the price over the next decision and links the ticker and Open ↗ to the detail page', () => {
    renderCard()

    expect(price()).toHaveTextContent('$104.20')
    expect(price()).toHaveTextContent('14d to next decision')
    expect(screen.getByRole('link', { name: 'XYZ' })).toHaveAttribute(
      'href',
      '#/positions/pmcc-xyz'
    )
    expect(screen.getByRole('link', { name: 'Open ↗' })).toHaveAttribute(
      'href',
      '#/positions/pmcc-xyz'
    )
  })

  it('renders the LEAPS block then the short-call block, each with its own figures', () => {
    renderCard()

    const [leaps, short, ...rest] = legBlocks()
    expect(rest).toEqual([])
    expect(leaps).toHaveTextContent(
      /^L\$80\.00 LEAPS · 2027-09-17315d\$26\.10Δ 0\.82 · \$25\.00 debit$/
    )
    expect(within(leaps).getByText('L')).toHaveAttribute(
      'title',
      'LEAPS — long call, the synthetic stock'
    )
    expect(short).toHaveTextContent(/^S◷\$108\.00 call · 2026-11-2014d\$0\.90/)
    expect(within(short).getByText('S')).toHaveAttribute('title', 'Short call — the income leg')
  })

  it('states the coverage beside the state label', () => {
    renderCard()

    expect(screen.getByText('1 × 100 sh')).toBeInTheDocument()
  })

  it('marks the diagonal against the cost basis: +$400.00 green, +18.9% of basis', () => {
    renderCard()

    expect(within(pnl()).getByText('+$400.00')).toHaveClass('text-wb-green')
    expect(within(pnl()).getByText('+18.9% of basis')).toHaveClass('text-wb-green')
  })

  it('reads a losing position in red with a negative percent of basis', () => {
    renderCard(XYZ_BACKGROUND, FALLING_SNAPSHOTS, '92.00')

    expect(within(pnl()).getByText('−$500.00')).toHaveClass('text-wb-red')
    expect(within(pnl()).getByText('−23.6% of basis')).toHaveClass('text-wb-red')
  })
})

describe('PmccCard — the short call’s own profit cue', () => {
  it('shows the TARGET chip at 50.0% of max on the short-call block', () => {
    renderCard()

    const short = legBlocks()[1]
    expect(within(short).getByText('TARGET')).toHaveAttribute(
      'title',
      expect.stringContaining('target is 50%')
    )
    expect(within(short).getByText('50.0% of max')).toHaveClass('text-wb-green')
  })

  it('shows N% of max and no TARGET chip below the target', () => {
    renderCard(XYZ_BACKGROUND, {
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('1.15', '1.25', '1.20', '0.3000')
    })

    const short = legBlocks()[1]
    expect(within(short).getByText('33.3% of max')).toHaveClass('text-wb-green')
    expect(within(short).queryByText('TARGET')).not.toBeInTheDocument()
  })

  it('reads a short above its fill as a red negative share of max', () => {
    renderCard(XYZ_BACKGROUND, {
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short': optionSnapshot('3.40', '3.60', '3.50', '0.6000')
    })

    expect(within(legBlocks()[1]).getByText('−94.4% of max')).toHaveClass('text-wb-red')
  })

  it('on a falling stock shows 88.9% of max in green beside TARGET, and no % of max profit', () => {
    renderCard(XYZ_BACKGROUND, FALLING_SNAPSHOTS, '92.00')

    const short = legBlocks()[1]
    expect(within(short).getByText('88.9% of max')).toHaveClass('text-wb-green')
    expect(within(short).getByText('TARGET')).toHaveTextContent('TARGET')
    expect(screen.queryByText(/of max profit/)).not.toBeInTheDocument()
  })
})

describe('PmccCard — action states', () => {
  it('a 14-DTE short opens a gold MANAGEMENT WINDOW strip, highlights the short and colours the edge', () => {
    renderCard()

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-tone', 'gold')
    expect(strip).toHaveTextContent(
      /^◷MANAGEMENT WINDOW · 14 DTE remaining — review for roll or close$/
    )
    const [leaps, short] = legBlocks()
    expect(short).toHaveAttribute('data-action', 'gold')
    expect(within(short).getByText('◷')).toHaveAttribute(
      'title',
      '14 DTE remaining — review for roll or close'
    )
    expect(leaps).not.toHaveAttribute('data-action')
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'gold')
  })

  it('▲ gold at $106.10 leads the strip with MANAGEMENT WINDOW on a +1 chip', () => {
    renderCard(XYZ_BACKGROUND, BG_SNAPSHOTS, '106.10')

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-tone', 'gold')
    expect(strip).toHaveTextContent(
      '▲ASSIGNMENT RISK · stock 1.8% below the $108.00 strike · plan the roll'
    )
    expect(within(strip).getByText('+1')).toHaveAttribute(
      'title',
      `Also open:\n${MANAGEMENT_WINDOW_LINE}`
    )
    const [leaps, short] = legBlocks()
    expect(short).toHaveAttribute('data-action', 'gold')
    expect(within(short).getByText('▲ ◷')).toHaveAttribute(
      'title',
      'Stock is 1.8% below the short-call strike — approaching assignment\n14 DTE remaining — review for roll or close'
    )
    expect(leaps).not.toHaveAttribute('data-action')
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'gold')
    expect(screen.getByText('PMCC')).toBeInTheDocument()
  })

  it('▲ red at $111.40 turns the strip, the short and the edge red', () => {
    renderCard(XYZ_BACKGROUND, BG_SNAPSHOTS, '111.40')

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-tone', 'red')
    expect(strip).toHaveTextContent(
      '▲ASSIGNMENT RISK · stock 3.1% above the $108.00 strike · roll or close'
    )
    const short = legBlocks()[1]
    expect(short).toHaveAttribute('data-action', 'red')
    expect(within(short).getByText('▲ ◷')).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Stock is 3.1% above the short-call strike — in the money, LEAPS would have to cover'
      )
    )
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'red')
  })

  it('✕ below breakeven leads a red strip with ▲ behind it on a +1 chip', () => {
    const item = withLegs(XYZ_BACKGROUND, [
      XYZ_LEAPS_LEG,
      {
        ...XYZ_SHORT_LEG,
        legId: 'xyz-short-99',
        strike: '99.0000',
        expiration: '2026-12-18',
        dte: 42,
        fillPerShare: '1.5500'
      }
    ])
    renderCard(
      item,
      { 'xyz-leaps': XYZ_LEAPS_SNAPSHOT, 'xyz-short-99': optionSnapshot('2.00', '2.10', '2.05') },
      '99.40'
    )

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-tone', 'red')
    expect(strip).toHaveTextContent(
      '✕BELOW BREAKEVEN · $99.00 strike is $2.20 under the $101.20 breakeven · roll up before it is called'
    )
    expect(within(strip).getByText('+1')).toHaveAttribute(
      'title',
      'Also open:\n▲ ASSIGNMENT RISK · stock 0.4% above the $99.00 strike · roll or close'
    )
    const short = legBlocks()[1]
    expect(short).toHaveAttribute('data-action', 'red')
    expect(within(short).getByText('✕ ▲')).toHaveAttribute(
      'title',
      expect.stringContaining(
        'Short strike below breakeven $101.20 — being called away locks in a loss'
      )
    )
    expect(screen.queryByText(/MANAGEMENT WINDOW/)).not.toBeInTheDocument()
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'red')
  })

  it('◆ inside the roll window marks the LEAPS block and turns its DTE gold', () => {
    const item = withLegs(XYZ_BACKGROUND, [
      { ...XYZ_LEAPS_LEG, dte: 59 },
      {
        ...XYZ_SHORT_LEG,
        legId: 'xyz-short-112',
        strike: '112.0000',
        expiration: '2027-08-20',
        dte: 31
      }
    ])
    renderCard(item, {
      'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
      'xyz-short-112': optionSnapshot('0.85', '0.95', '0.90')
    })

    const strip = screen.getByRole('status')
    expect(strip).toHaveAttribute('data-tone', 'gold')
    expect(strip).toHaveTextContent(
      /^◆ROLL WINDOW · LEAPS 59d left, inside the 60-day window · roll while it has time value$/
    )
    const [leaps, short] = legBlocks()
    expect(leaps).toHaveAttribute('data-action', 'gold')
    expect(within(leaps).getByText('◆')).toHaveAttribute(
      'title',
      'LEAPS inside the 60-day roll window'
    )
    const leapsDte = within(leaps).getByText('59d')
    expect(leapsDte).toHaveClass('text-wb-gold')
    expect(leapsDte).toHaveAttribute('title', 'Roll window — LEAPS inside the 60-day window')
    expect(short).not.toHaveAttribute('data-action')
    const shortDte = within(short).getByText('31d')
    expect(shortDte).not.toHaveClass('text-wb-gold')
    expect(shortDte).not.toHaveAttribute('title')
    expect(screen.queryByText(/MANAGEMENT WINDOW/)).not.toBeInTheDocument()
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'gold')
    expect(screen.getByText('PMCC')).toBeInTheDocument()
  })

  it('a 4-DTE short reads EXPIRING with its DTE gold and the LEAPS DTE plain', () => {
    const item = withLegs(XYZ_BACKGROUND, [
      { ...XYZ_LEAPS_LEG, dte: 305 },
      { ...XYZ_SHORT_LEG, dte: 4 }
    ])
    renderCard(item)

    expect(screen.getByRole('status')).toHaveTextContent(
      /^◷EXPIRING · Expires in 4 days at \$108\.00 strike$/
    )
    const [leaps, short] = legBlocks()
    const shortDte = within(short).getByText('4d')
    expect(shortDte).toHaveClass('text-wb-gold')
    expect(shortDte).toHaveAttribute('title', 'Expiring soon — short call inside 7 days')
    expect(within(leaps).getByText('305d')).not.toHaveClass('text-wb-gold')
    expect(short).toHaveAttribute('data-action', 'gold')
    expect(within(short).getByText('◷')).toHaveAttribute(
      'title',
      'Expires in 4 days at $108.00 strike'
    )
  })
})

describe('PmccCard — awareness tags', () => {
  const HEALTHY = withLegs(XYZ_BACKGROUND, [
    { ...XYZ_LEAPS_LEG, dte: 326 },
    { ...XYZ_SHORT_LEG, dte: 25 }
  ])
  const HEALTHY_SNAPSHOTS: SnapshotsByLegId = {
    'xyz-leaps': XYZ_LEAPS_SNAPSHOT,
    'xyz-short': optionSnapshot('1.15', '1.25', '1.20', '0.3000')
  }

  it('renders ⚑ then ⚠ after the badge with their tooltips, and no strip, highlight or edge', () => {
    renderCard(
      { ...HEALTHY, nextEarnings: '2026-11-13' },
      { ...HEALTHY_SNAPSHOTS, 'xyz-leaps': optionSnapshot('24.60', '27.60', '26.10', '0.8200') }
    )

    const tags = awarenessTags()
    expect(tags.map((tag) => [tag.textContent, tag.getAttribute('title')])).toEqual([
      ['⚑', 'Earnings in 7 days before your 2026-11-20 expiration'],
      ['⚠', 'LEAPS spread is 11.5% of the mid — the P&L that depends on it is unreliable']
    ])
    expect(tags.map((tag) => tag.getAttribute('aria-label'))).toEqual(['Earnings', 'Wide spread'])
    expect(tags[0]).toHaveClass('text-wb-gold')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    legBlocks().forEach((block) => expect(block).not.toHaveAttribute('data-action'))
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'PMCC')
  })

  it('renders the δ tag below the delta floor and no strip', () => {
    renderCard(
      XYZ_LEAPS_ONLY,
      { 'xyz-leaps': optionSnapshot('10.00', '10.40', '10.20', '0.5400') },
      '86.50'
    )

    expect(legBlocks()[0]).toHaveTextContent('Δ 0.54 · $25.00 debit')
    expect(screen.getByRole('img', { name: 'Delta floor' })).toHaveAttribute(
      'title',
      'LEAPS delta 0.54 below 0.60 — no longer tracking as synthetic stock'
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(legBlocks()[0]).not.toHaveAttribute('data-action')
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'PMCC')
  })

  it('a healthy card shows no strip and no tags, where the 14-DTE card shows its strip', () => {
    const { unmount } = renderCard(HEALTHY, HEALTHY_SNAPSHOTS)

    expect(screen.getByText('LEAPS + short call open')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(awarenessTags()).toEqual([])
    legBlocks().forEach((block) => expect(block).not.toHaveAttribute('data-action'))
    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'PMCC')
    unmount()

    renderCard(
      withLegs(HEALTHY, [{ ...XYZ_LEAPS_LEG, dte: 326 }, XYZ_SHORT_LEG]),
      HEALTHY_SNAPSHOTS
    )
    expect(screen.getByRole('status')).toHaveTextContent('MANAGEMENT WINDOW')
  })
})

describe('PmccCard — marks and data gaps', () => {
  it('a wide LEAPS spread puts ⚠ on the LEAPS mark and on the P&L, and the strip stays', () => {
    renderCard(XYZ_BACKGROUND, {
      'xyz-leaps': optionSnapshot('24.60', '27.60', '26.10', '0.8200'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })

    const [leaps, short] = legBlocks()
    expect(within(leaps).getByText('$26.10')).toHaveTextContent(/^\$26\.10⚠$/)
    expect(
      within(leaps).getByTitle('Wide spread: $24.60 × $27.60 — P&L may be unreliable')
    ).toHaveTextContent('⚠')
    expect(within(short).getByText('$0.90')).toHaveTextContent(/^\$0\.90$/)
    expect(pnl()).toHaveTextContent('+$400.00⚠')
    expect(
      within(pnl()).getByTitle('Wide spread — the LEAPS spread makes this P&L unreliable')
    ).toHaveTextContent('⚠')
    expect(screen.getByRole('status')).toHaveTextContent('MANAGEMENT WINDOW')
  })

  it('a tight LEAPS spread puts no ⚠ on the P&L', () => {
    renderCard()

    expect(pnl()).toHaveTextContent(/^\+\$400\.00\+18\.9% of basis$/)
  })

  it('a missing LEAPS snapshot leaves the P&L unavailable and the short its TARGET', () => {
    renderCard(XYZ_BACKGROUND, { 'xyz-short': XYZ_SHORT_SNAPSHOT })

    const [leaps, short] = legBlocks()
    expect(within(leaps).getByText('— unavail.')).toBeInTheDocument()
    expect(within(short).getByText('$0.90')).toHaveTextContent(/^\$0\.90$/)
    expect(pnl()).toHaveTextContent(/^—unavailable — a leg has no mark$/)
    expect(within(short).getByText('TARGET')).toBeInTheDocument()
    expect(footerCell('Cost basis')).toHaveTextContent(/^Cost basis\$2,120\.00\$21\.20 \/ share$/)
  })

  it('a missing short snapshot dashes the short’s % of max, and the LEAPS keeps its figures', () => {
    renderCard(XYZ_BACKGROUND, { 'xyz-leaps': XYZ_LEAPS_SNAPSHOT })

    const [leaps, short] = legBlocks()
    expect(leaps).toHaveTextContent(/\$26\.10Δ 0\.82 · \$25\.00 debit$/)
    expect(within(short).getByText('— unavail.')).toBeInTheDocument()
    expect(short).toHaveTextContent(/— unavail\.—$/)
    expect(within(short).queryByText('TARGET')).not.toBeInTheDocument()
  })

  it('missing greeks blank the delta and suppress δ, leaving the P&L', () => {
    renderCard(XYZ_BACKGROUND, {
      'xyz-leaps': optionSnapshot('25.70', '26.50', '26.10'),
      'xyz-short': XYZ_SHORT_SNAPSHOT
    })

    expect(legBlocks()[0]).toHaveTextContent('Δ — · $25.00 debit')
    expect(screen.queryByRole('img', { name: 'Delta floor' })).not.toBeInTheDocument()
    expect(within(pnl()).getByText('+$400.00')).toBeInTheDocument()
  })
})

describe('PmccCard — footer', () => {
  it('shows the cost basis in sky and the credits with a green recovery meter at 15.2%', () => {
    renderCard()

    expect(footerCell('Cost basis')).toHaveTextContent(/^Cost basis\$2,120\.00\$21\.20 \/ share$/)
    expect(within(footerCell('Cost basis')).getByText('$2,120.00')).toHaveClass('text-wb-sky')
    const credits = footerCell('Credits collected')
    expect(credits).toHaveTextContent(/^Credits collected\$380\.0015\.2% of LEAPS cost recovered$/)
    expect(within(credits).getByText('$380.00')).toHaveClass('text-wb-green')
    const meter = within(credits).getByTestId('recovery-meter')
    expect(meter).toHaveAttribute('data-fill', '15.2')
    expect(meter).toHaveClass('bg-wb-green')
    expect(meter).toHaveStyle({ width: '15.2%' })
  })

  it('a LEAPS paid for reads its negative basis in gold and fills the meter gold', () => {
    renderCard(
      XYZ_PAID_FOR,
      {
        'xyz-leaps-85': optionSnapshot('33.10', '33.70', '33.40', '0.8800'),
        'xyz-short-120': optionSnapshot('0.90', '1.00', '0.95', '0.1500')
      },
      '110.00'
    )

    const basis = footerCell('Cost basis')
    expect(within(basis).getByText('−$40.00')).toHaveClass('text-wb-gold')
    expect(within(basis).getByText('LEAPS paid for')).toHaveClass('text-wb-gold')
    expect(basis.querySelector('.text-wb-red')).toBeNull()
    const credits = footerCell('Credits collected')
    expect(credits).toHaveTextContent('$2,290.00')
    expect(credits).toHaveTextContent('101.8% of LEAPS cost recovered')
    const meter = within(credits).getByTestId('recovery-meter')
    expect(meter).toHaveAttribute('data-fill', '100')
    expect(meter).toHaveClass('bg-wb-gold')
    expect(pnl()).toHaveTextContent(/^\+\$3,285\.00basis not positive$/)
  })
})

describe('PmccCard — contracts and coverage', () => {
  it('scales totals with contracts and puts ×3 on both leg titles', () => {
    renderCard(XYZ_THREE_CONTRACTS)

    expect(screen.getByText('$80.00 LEAPS ×3')).toBeInTheDocument()
    expect(screen.getByText('$108.00 call ×3')).toBeInTheDocument()
    expect(screen.getByText('3 × 100 sh')).toBeInTheDocument()
    expect(pnl()).toHaveTextContent(/^\+\$1,200\.00\+18\.9% of basis$/)
    expect(within(legBlocks()[1]).getByText('50.0% of max')).toBeInTheDocument()
    expect(within(legBlocks()[1]).getByText('TARGET')).toBeInTheDocument()
  })

  it('states partial coverage', () => {
    renderCard(XYZ_PARTIAL_COVERAGE)

    expect(screen.getByText('1 of 3 covered')).toBeInTheDocument()
    expect(pnl()).toHaveTextContent(/^\+\$1,380\.00\+21\.7% of basis$/)
  })

  it('renders three blocks for two shorts and highlights only the at-risk $108.00 short', () => {
    renderCard(
      XYZ_TWO_SHORTS,
      {
        'xyz-leaps': optionSnapshot('28.10', '28.70', '28.40', '0.8500'),
        'xyz-short': optionSnapshot('1.15', '1.25', '1.20', '0.3500'),
        'xyz-short-112': optionSnapshot('1.00', '1.10', '1.05', '0.2500')
      },
      '106.80'
    )

    expect(screen.getByText('LEAPS + 2 short calls open')).toBeInTheDocument()
    expect(screen.getByText('2 × 100 sh')).toBeInTheDocument()
    const blocks = legBlocks()
    expect(blocks.map((block) => block.getAttribute('data-action'))).toEqual([null, 'gold', null])
    expect(within(blocks[0]).getByText('$80.00 LEAPS ×2')).toBeInTheDocument()
    expect(within(blocks[1]).getByText('$108.00 call')).toBeInTheDocument()
    expect(within(blocks[1]).getByText('▲ ◷')).toBeInTheDocument()
    expect(within(blocks[2]).getByText('$112.00 call')).toBeInTheDocument()
    expect(pnl()).toHaveTextContent(/^\+\$1,215\.00\+28\.7% of basis$/)
  })
})

describe('PmccCard — the Detail bar and tier 2', () => {
  it('starts collapsed with the Detail bar and no tier-2 cells', () => {
    renderCard()

    expect(detailBar()).toHaveAttribute('aria-expanded', 'false')
    expect(detailBar()).not.toHaveClass('text-wb-gold')
    expect(tier2Cells()).toEqual([])
  })

  it('opens tier 2 on a Detail-bar click with the seven Background cells', async () => {
    renderCard()

    await userEvent.click(detailBar())

    expect(tier2Cells().map((cell) => cell.textContent)).toEqual([
      'Credits collected$380.004 short-call cycles · 15.2% of LEAPS cost',
      'Breakeven$101.20LEAPS $80.00 + basis $21.20 / share',
      'Max if called+$680.00called away at $108.00',
      'LEAPS delta0.82tracking as synthetic stock',
      'Short extrinsic$0.90OTM — all extrinsic',
      'LEAPS mark$26.10$25.70 × $26.50 · 3.1% wide',
      'Entry net debit$2,320.00$23.20 / share · opened 2026-04-17 · 203d ago'
    ])
    const bar = screen.getByRole('button', { name: /Hide detail/ })
    expect(bar).toHaveAttribute('aria-expanded', 'true')
    expect(bar).toHaveClass('text-wb-gold')
  })

  it('a second Detail-bar click collapses tier 2', async () => {
    renderCard()

    await userEvent.click(detailBar())
    await userEvent.click(screen.getByRole('button', { name: /Hide detail/ }))

    expect(detailBar()).toHaveAttribute('aria-expanded', 'false')
    expect(tier2Cells()).toEqual([])
  })

  it('a click on the open card body opens the position detail and leaves tier 2 closed', async () => {
    renderCard()

    await userEvent.click(within(pnl()).getByText('+$400.00'))

    expect(window.location.hash).toBe('#/positions/pmcc-xyz')
    expect(detailBar()).toHaveAttribute('aria-expanded', 'false')
  })

  it('a Detail-bar click toggles tier 2 without opening the position detail', async () => {
    renderCard()

    await userEvent.click(detailBar())

    expect(tier2Cells()).toHaveLength(7)
    expect(window.location.hash).toBe('')
  })

  it('Escape collapses an open tier 2', async () => {
    renderCard()

    await userEvent.click(detailBar())
    expect(tier2Cells()).toHaveLength(7)
    await userEvent.keyboard('{Escape}')

    expect(tier2Cells()).toEqual([])
    expect(detailBar()).toHaveAttribute('aria-expanded', 'false')
  })

  it.each(['XYZ', 'Open ↗'])(
    'clicking the %s link opens the detail page and leaves tier 2 as it was',
    async (name) => {
      renderCard()
      await userEvent.click(detailBar())

      await userEvent.click(screen.getByRole('link', { name }))

      expect(window.location.hash).toBe('#/positions/pmcc-xyz')
      expect(screen.getByRole('button', { name: /Hide detail/ })).toHaveAttribute(
        'aria-expanded',
        'true'
      )
    }
  )

  it('shows the live assignment math in the money', async () => {
    renderCard(
      XYZ_BACKGROUND,
      { 'xyz-leaps': XYZ_LEAPS_SNAPSHOT, 'xyz-short': optionSnapshot('3.40', '3.60', '3.50') },
      '111.40'
    )

    await userEvent.click(detailBar())

    const cells = tier2Cells().map((cell) => cell.textContent)
    expect(cells).toContain('Short extrinsic$0.10ITM — assignment math is live')
    expect(cells).toContain('Max if called+$680.00called away at $108.00')
  })
})

describe('PmccCard — closed', () => {
  it('a closed card is muted with dashed live figures, no signals or Detail bar, and its footer', () => {
    renderCard({ ...XYZ_BACKGROUND, status: 'CLOSED' }, BG_SNAPSHOTS, '111.40')

    const card = screen.getByTestId('position-card-closed')
    expect(card).toHaveClass('opacity-50')
    expect(card).toHaveAttribute('data-edge', 'PMCC')
    expect(screen.getByText('PMCC')).toBeInTheDocument()
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(price()).toHaveTextContent(/^—closed$/)
    const [leaps, short] = legBlocks()
    expect(leaps).toHaveTextContent(/^L\$80\.00 LEAPS · 2027-09-17——$/)
    expect(short).toHaveTextContent(/^S\$108\.00 call · 2026-11-20——$/)
    expect(pnl()).toHaveTextContent(/^—closed — no live marks$/)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(awarenessTags()).toEqual([])
    expect(screen.queryByRole('button', { name: DETAIL_BAR })).not.toBeInTheDocument()
    expect(footerCell('Cost basis')).toHaveTextContent('$2,120.00')
    expect(footerCell('Credits collected')).toHaveTextContent('$380.00')
  })

  it('isClosed renders an ACTIVE item closed', () => {
    renderCard(XYZ_BACKGROUND, BG_SNAPSHOTS, '104.20', { isClosed: true })

    expect(screen.getByTestId('position-card-closed')).toHaveTextContent('XYZ')
    expect(screen.queryByTestId('position-card')).not.toBeInTheDocument()
  })

  it('a click on the closed card body opens the position detail', async () => {
    renderCard({ ...XYZ_BACKGROUND, status: 'CLOSED' })

    await userEvent.click(screen.getByText('closed — no live marks'))

    expect(window.location.hash).toBe('#/positions/pmcc-xyz')
  })
})

describe('PmccCard — a PMCC phase the card does not know', () => {
  it('renders the PMCC badge, the raw phase label and dashed figures, with no signals', () => {
    // A later story's phase reaches the renderer as data first.
    renderCard(
      { ...XYZ_BACKGROUND, phase: toPmccListPhase('PMCC_ASSIGNED') },
      BG_SNAPSHOTS,
      '106.10'
    )

    expect(screen.getByTestId('position-card')).toHaveAttribute('data-edge', 'PMCC')
    expect(screen.getByText('PMCC')).toBeInTheDocument()
    expect(screen.getByText('PMCC_ASSIGNED')).toBeInTheDocument()
    expect(price()).toHaveTextContent(/^——$/)
    const [leaps, short] = legBlocks()
    expect(leaps).toHaveTextContent(/^L\$80\.00 LEAPS · 2027-09-17——$/)
    expect(short).toHaveTextContent(/^S\$108\.00 call · 2026-11-20——$/)
    expect(pnl()).toHaveTextContent(/^——$/)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(awarenessTags()).toEqual([])
    expect(screen.queryByRole('button', { name: DETAIL_BAR })).not.toBeInTheDocument()
    expect(screen.queryByText('CC Open')).not.toBeInTheDocument()
    expect(screen.queryByText(/of max profit/)).not.toBeInTheDocument()
  })
})
