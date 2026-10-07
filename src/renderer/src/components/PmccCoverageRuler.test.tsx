// [US-104] The coverage ruler: today, the current short, the replacement and the LEAPS on one axis.
import { render, screen } from '@testing-library/react'
import { PmccCoverageRuler } from './PmccCoverageRuler'

const TODAY = '2026-11-06'
const CURRENT = '2026-11-20' // 14 DTE
const LEAPS = '2027-09-17' // 315 DTE

function renderRuler(replacementExpiration: string): HTMLElement {
  render(
    <PmccCoverageRuler
      today={TODAY}
      currentExpiration={CURRENT}
      replacementExpiration={replacementExpiration}
      leapsExpiration={LEAPS}
    />
  )
  return screen.getByTestId('pmcc-coverage-ruler')
}

const marks = (): Array<string | null> =>
  Array.from(document.querySelectorAll('[data-mark]')).map((el) => el.getAttribute('data-mark'))

describe('PmccCoverageRuler', () => {
  it('marks today, the current short and the LEAPS before a replacement is entered', () => {
    renderRuler('')
    expect(marks()).toEqual(['today', 'current', 'leaps'])
  })

  it('adds the replacement mark once a replacement expiration is entered', () => {
    renderRuler('2026-12-18')
    expect(marks()).toEqual(['today', 'current', 'replacement', 'leaps'])
  })

  it('without a replacement, states how long the current short and the LEAPS run', () => {
    const ruler = renderRuler('')
    expect(ruler).toHaveTextContent(
      'Current short call expires in 14 days. The LEAPS covers 315 days.'
    )
    expect(ruler).toHaveAttribute('data-blocked', 'false')
  })

  it('a replacement before the LEAPS states its DTE and the remaining coverage', () => {
    const ruler = renderRuler('2026-12-18')
    expect(ruler).toHaveTextContent(
      'Replacement short at 42 DTE. The LEAPS still covers it by 273 days.'
    )
    expect(ruler).toHaveAttribute('data-blocked', 'false')
  })

  it.each([LEAPS, '2027-10-15'])('a replacement at or past the LEAPS (%s) is blocked', (exp) => {
    const ruler = renderRuler(exp)
    expect(ruler).toHaveAttribute('data-blocked', 'true')
    expect(ruler).toHaveTextContent(
      'The replacement short reaches the LEAPS. Past this point the short call is naked.'
    )
  })

  it('a replacement before the current short is a buyback, not a roll', () => {
    const ruler = renderRuler('2026-11-13')
    expect(ruler).toHaveAttribute('data-blocked', 'true')
    expect(ruler).toHaveTextContent(
      'The replacement expires before the current short call — that is a buyback, not a roll.'
    )
  })

  it('places each mark at its share of the LEAPS horizon', () => {
    renderRuler('2026-12-18')
    const left = (mark: string): string | undefined =>
      document.querySelector<HTMLElement>(`[data-mark="${mark}"]`)?.style.left
    expect(left('today')).toBe('0%')
    expect(left('current')).toBe(`${((14 / 315) * 100).toFixed(2)}%`)
    expect(left('replacement')).toBe(`${((42 / 315) * 100).toFixed(2)}%`)
    expect(left('leaps')).toBe('100%')
  })

  it('tints the replacement mark red when blocked and gold otherwise; the LEAPS mark is green', () => {
    renderRuler('2026-12-18')
    expect(document.querySelector('[data-mark="replacement"]')).toHaveClass('bg-wb-gold')
    expect(document.querySelector('[data-mark="leaps"]')).toHaveClass('bg-wb-green')
  })

  it('tints the replacement mark red when the replacement reaches the LEAPS', () => {
    renderRuler(LEAPS)
    expect(document.querySelector('[data-mark="replacement"]')).toHaveClass('bg-wb-red')
  })
})
