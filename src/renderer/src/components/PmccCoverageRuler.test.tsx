// [US-104][US-105] The coverage ruler: one axis from today to the furthest dated mark, a fill bar,
// a tick per dated mark, a legend row per mark, and the caller's note.
import { render, screen, within } from '@testing-library/react'
import type { PmccRulerMark } from '../lib/pmcc-roll-coverage'
import { PmccCoverageRuler } from './PmccCoverageRuler'

const TODAY = '2026-11-06'
const CURRENT = '2026-11-20' // 14 DTE
const REPLACEMENT = '2026-12-18' // 42 DTE
const LEAPS = '2027-09-17' // 315 DTE

const TODAY_MARK: PmccRulerMark = {
  key: 'today',
  date: TODAY,
  label: 'Today',
  value: TODAY,
  tone: 'muted'
}
const CURRENT_MARK: PmccRulerMark = {
  key: 'current',
  date: CURRENT,
  label: 'Current short call',
  value: `${CURRENT} · 14 DTE`,
  tone: 'secondary'
}
const LEAPS_MARK: PmccRulerMark = {
  key: 'leaps',
  date: LEAPS,
  label: 'LEAPS (covers)',
  value: `${LEAPS} · 315 DTE`,
  tone: 'green'
}
const replacementMark = (date: string | null): PmccRulerMark => ({
  key: 'replacement',
  date,
  label: 'Replacement short call',
  value: date === null ? 'not entered' : `${date} · DTE`,
  tone: 'accent'
})

type RulerCase = { replacement: string | null; blocked?: boolean; note?: string }

function renderRuler({ replacement, blocked = false, note = 'A note.' }: RulerCase): HTMLElement {
  render(
    <PmccCoverageRuler
      today={TODAY}
      blocked={blocked}
      fillTo={replacement ?? CURRENT}
      marks={[TODAY_MARK, CURRENT_MARK, replacementMark(replacement), LEAPS_MARK]}
      note={note}
    />
  )
  return screen.getByTestId('pmcc-coverage-ruler')
}

const ticks = (): Array<string | null> =>
  Array.from(document.querySelectorAll('[data-mark]')).map((el) => el.getAttribute('data-mark'))

const tick = (key: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-mark="${key}"]`)

const fill = (): HTMLElement => screen.getByTestId('pmcc-coverage-fill')

describe('PmccCoverageRuler — marks', () => {
  it('ticks only the marks with a date', () => {
    renderRuler({ replacement: null })
    expect(ticks()).toEqual(['today', 'current', 'leaps'])
  })

  it('ticks every mark once each has a date', () => {
    renderRuler({ replacement: REPLACEMENT })
    expect(ticks()).toEqual(['today', 'current', 'replacement', 'leaps'])
  })

  it('still lists an undated mark in the legend with its label and value', () => {
    const ruler = renderRuler({ replacement: null })
    const legend = within(ruler).getByText('Replacement short call').parentElement
    expect(legend).toHaveTextContent('Replacement short call')
    expect(legend).toHaveTextContent('not entered')
  })

  it('renders whatever marks the caller supplies: an undated open short is legend-only', () => {
    render(
      <PmccCoverageRuler
        today={TODAY}
        blocked={false}
        fillTo={LEAPS}
        marks={[
          TODAY_MARK,
          { key: 'short', date: null, label: 'Open short call', value: 'none', tone: 'secondary' },
          { ...LEAPS_MARK, key: 'current-leaps', label: 'Current LEAPS (selling)' }
        ]}
        note="Current LEAPS expires in 315 days."
      />
    )
    expect(ticks()).toEqual(['today', 'current-leaps'])
    const legend = screen.getByText('Open short call').parentElement
    expect(legend).toHaveTextContent('none')
    expect(screen.getByText('Current LEAPS expires in 315 days.')).toBeInTheDocument()
  })

  it('lists every mark in the legend in the order given', () => {
    const ruler = renderRuler({ replacement: REPLACEMENT })
    const labels = [TODAY_MARK, CURRENT_MARK, replacementMark(REPLACEMENT), LEAPS_MARK].map(
      (mark) => mark.label
    )
    labels.forEach((label) => expect(within(ruler).getByText(label)).toBeInTheDocument())
    expect(ruler.textContent?.indexOf('Today')).toBeLessThan(
      ruler.textContent?.indexOf('LEAPS (covers)') ?? -1
    )
  })

  it('places each dated mark at its share of the furthest mark’s DTE', () => {
    renderRuler({ replacement: REPLACEMENT })
    expect(tick('today')?.style.left).toBe('0%')
    expect(tick('current')?.style.left).toBe(`${((14 / 315) * 100).toFixed(2)}%`)
    expect(tick('replacement')?.style.left).toBe(`${((42 / 315) * 100).toFixed(2)}%`)
    expect(tick('leaps')?.style.left).toBe('100%')
  })

  it('spans the axis to the furthest dated mark, whichever it is', () => {
    render(
      <PmccCoverageRuler
        today={TODAY}
        blocked={false}
        fillTo={CURRENT}
        marks={[TODAY_MARK, CURRENT_MARK]}
        note=""
      />
    )
    expect(tick('current')?.style.left).toBe('100%')
  })

  it('fills the axis up to fillTo', () => {
    renderRuler({ replacement: REPLACEMENT })
    expect(fill().style.width).toBe(`${((42 / 315) * 100).toFixed(2)}%`)
  })

  it('colours each tick by its tone', () => {
    renderRuler({ replacement: REPLACEMENT })
    expect(tick('today')).toHaveClass('bg-wb-text-muted')
    expect(tick('current')).toHaveClass('bg-wb-text-secondary')
    expect(tick('leaps')).toHaveClass('bg-wb-green')
  })

  it('uses inline styles only for the percentage offsets and widths', () => {
    const ruler = renderRuler({ replacement: REPLACEMENT })
    const styled = Array.from(ruler.querySelectorAll<HTMLElement>('[style]'))
    styled.forEach((el) => {
      const props = Array.from({ length: el.style.length }, (_, i) => el.style.item(i))
      props.forEach((prop) => expect(['left', 'width']).toContain(prop))
      props.forEach((prop) => expect(el.style.getPropertyValue(prop)).toMatch(/^\d+(\.\d+)?%$/))
    })
    expect(styled.length).toBeGreaterThan(0)
  })
})

describe('PmccCoverageRuler — blocked', () => {
  it('tints the fill and the accent mark gold when not blocked', () => {
    const ruler = renderRuler({ replacement: REPLACEMENT })
    expect(ruler).toHaveAttribute('data-blocked', 'false')
    expect(fill()).toHaveClass('bg-wb-gold')
    expect(tick('replacement')).toHaveClass('bg-wb-gold')
    expect(tick('replacement')).not.toHaveClass('bg-wb-red')
  })

  it('tints the fill and the accent mark red when blocked', () => {
    const ruler = renderRuler({ replacement: LEAPS, blocked: true })
    expect(ruler).toHaveAttribute('data-blocked', 'true')
    expect(fill()).toHaveClass('bg-wb-red')
    expect(tick('replacement')).toHaveClass('bg-wb-red')
    expect(tick('replacement')).not.toHaveClass('bg-wb-gold')
  })

  it('draws the accent mark taller than the others', () => {
    renderRuler({ replacement: REPLACEMENT })
    expect(tick('replacement')).toHaveClass('h-6')
    expect(tick('leaps')).toHaveClass('h-3')
  })
})

describe('PmccCoverageRuler — note', () => {
  it('renders the note verbatim, in the secondary colour when not blocked', () => {
    const note = 'Current short call expires in 14 days. The LEAPS covers 315 days.'
    renderRuler({ replacement: null, note })
    const p = screen.getByText(note)
    expect(p).toHaveClass('text-wb-text-secondary')
  })

  it('renders the note in red when blocked', () => {
    const note = 'The replacement short reaches the LEAPS. Past this point the short call is naked.'
    renderRuler({ replacement: LEAPS, blocked: true, note })
    expect(screen.getByText(note)).toHaveClass('text-wb-red')
  })
})
