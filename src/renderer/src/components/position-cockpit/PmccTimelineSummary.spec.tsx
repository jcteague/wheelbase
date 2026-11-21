// [US-109] The Timeline summary drawer: six totals and the reconciliation to the US-103 Cost
// basis drawer, from the literal summaries of the story's XYZ Background in the fixture.
import { render, screen, within } from '@testing-library/react'
import type { PmccTimelineSummary as Summary } from '../../../../main/core/pmcc-timeline'
import { PmccTimelineSummary } from './PmccTimelineSummary'
import { LEAPS_ONLY_TIMELINE, XYZ_CLOSED_TIMELINE, XYZ_TIMELINE } from './PmccLegTimeline.fixture'

const BACKGROUND = XYZ_TIMELINE.summary
const LEAPS_ONLY = LEAPS_ONLY_TIMELINE.summary

const SENTENCE =
  'Realized $14.00 + open $1.95 = $15.95 short-call credits to date. LEAPS cost to date $22.50 − $15.95 = $6.55 cost basis per share.'

function renderSummary(summary: Summary): HTMLElement {
  return render(<PmccTimelineSummary timeline={{ summary }} />).container
}

/** The value beside a stat label. */
function statValue(label: string): HTMLElement {
  const value = screen.getByText(label).nextElementSibling
  if (!(value instanceof HTMLElement)) throw new Error(`no value for ${label}`)
  return value
}

/** The reconciliation line, whose sentence spans the sky-coloured basis span. */
function reconciliation(sentence: string): HTMLElement {
  return screen.getByText((_, el) => el?.tagName === 'DIV' && el.textContent === sentence)
}

describe('PmccTimelineSummary', () => {
  it('captions the drawer as reconciling to the Cost basis drawer', () => {
    renderSummary(BACKGROUND)
    expect(
      screen.getByText('US-109 · reconciles to the Cost basis drawer above')
    ).toBeInTheDocument()
  })

  it.each([
    ['Cycles', '9 · 8 closed · 1 open'],
    ['Realized net credits', '+$14.00 / share (+$1,400.00)'],
    ['Average per closed cycle', '+$1.75 / share (+$175.00)'],
    ['Open cycle credit', '+$1.95 / share · open'],
    ['LEAPS roll net', '+$2.50 / share · on the LEAPS track'],
    ['Coverage', '289 of 333 days · 44 uncovered']
  ])('"%s" reads %s for the Background', (label, value) => {
    renderSummary(BACKGROUND)
    expect(statValue(label).textContent).toBe(value)
  })

  it('lays the six stats out in AC order', () => {
    const container = renderSummary(BACKGROUND)
    const labels = [
      'Cycles',
      'Realized net credits',
      'Average per closed cycle',
      'Open cycle credit',
      'LEAPS roll net',
      'Coverage'
    ]
    const text = container.textContent ?? ''
    const positions = labels.map((label) => text.indexOf(label))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })

  it('reads the reconciliation sentence', () => {
    renderSummary(BACKGROUND)
    expect(reconciliation(SENTENCE)).toHaveClass('font-wb-mono', 'text-wb-text-secondary')
  })

  it('colours the reconciled basis sky', () => {
    renderSummary(BACKGROUND)
    expect(screen.getByText('$6.55')).toHaveClass('text-wb-sky')
  })

  it('colours realized credits green and the open credit gold', () => {
    renderSummary(BACKGROUND)
    expect(screen.getByText('+$14.00 / share (+$1,400.00)')).toHaveClass('text-wb-green')
    expect(screen.getByText('+$1.95 / share · open')).toHaveClass('text-wb-gold')
  })

  it('leaves the Cycles and Coverage values uncoloured', () => {
    renderSummary(BACKGROUND)
    for (const value of ['9 · 8 closed · 1 open', '289 of 333 days · 44 uncovered']) {
      for (const tone of ['text-wb-green', 'text-wb-gold', 'text-wb-text-muted']) {
        expect(screen.getByText(value)).not.toHaveClass(tone)
      }
    }
  })

  it('does not colour a net-debit realized total green', () => {
    renderSummary({ ...BACKGROUND, realizedPerShare: '-0.4000', realizedTotal: '-40.0000' })
    expect(statValue('Realized net credits').textContent).toBe('−$0.40 / share (−$40.00)')
    expect(screen.getByText('−$0.40 / share (−$40.00)')).not.toHaveClass('text-wb-green')
  })

  it('does not colour a net-debit LEAPS roll green', () => {
    renderSummary({ ...BACKGROUND, leapsRollNetPerShare: '-0.6000' })
    expect(screen.getByText('−$0.60 / share · on the LEAPS track')).not.toHaveClass('text-wb-green')
  })

  describe('with no short call sold', () => {
    it.each([
      ['Average per closed cycle', '—'],
      ['Open cycle credit', '—'],
      ['LEAPS roll net', 'no roll yet']
    ])('"%s" reads %s, muted', (label, value) => {
      renderSummary(LEAPS_ONLY)
      expect(statValue(label).textContent).toBe(value)
      expect(within(statValue(label)).getByText(value)).toHaveClass('text-wb-text-muted')
    })

    it('reconciles with an open credit of $0.00', () => {
      renderSummary(LEAPS_ONLY)
      expect(
        reconciliation(
          'Realized $0.00 + open $0.00 = $0.00 short-call credits to date. LEAPS cost to date $19.80 − $0.00 = $19.80 cost basis per share.'
        )
      ).toBeInTheDocument()
    })
  })

  describe('closed, with cycle 9 assigned', () => {
    it.each([
      ['Cycles', '9 · 9 closed'],
      ['Realized net credits', '+$15.95 / share (+$1,595.00)'],
      ['Average per closed cycle', '+$1.77 / share (+$177.22)'],
      ['Open cycle credit', '—'],
      ['Coverage', '296 of 340 days · 44 uncovered']
    ])('"%s" reads %s', (label, value) => {
      renderSummary(XYZ_CLOSED_TIMELINE.summary)
      expect(statValue(label).textContent).toBe(value)
    })

    it('reconciles with nothing open: all $15.95 of credits realized', () => {
      renderSummary(XYZ_CLOSED_TIMELINE.summary)
      expect(
        reconciliation(
          'Realized $15.95 + open $0.00 = $15.95 short-call credits to date. LEAPS cost to date $22.50 − $15.95 = $6.55 cost basis per share.'
        )
      ).toBeInTheDocument()
    })
  })

  it('reconciles a short roll no cycle holds as unattributed', () => {
    renderSummary({
      ...LEAPS_ONLY,
      unattributedShortPerShare: '1.0000',
      shortCreditsPerShare: '1.0000',
      basisPerShare: '18.8000'
    })
    expect(
      reconciliation(
        'Realized $0.00 + open $0.00 + unattributed $1.00 = $1.00 short-call credits to date. LEAPS cost to date $19.80 − $1.00 = $18.80 cost basis per share.'
      )
    ).toHaveClass('font-wb-mono', 'text-wb-text-secondary')
  })

  it.each([/%/, /annualized/i])('never shows text matching %s', (pattern) => {
    const container = renderSummary(BACKGROUND)
    expect(statValue('Cycles').textContent).toBe('9 · 8 closed · 1 open')
    expect(container.textContent).not.toMatch(pattern)
  })
})
