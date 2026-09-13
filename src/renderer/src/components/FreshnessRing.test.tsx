import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FreshnessRing } from './FreshnessRing'

// [US-96] The ring is the tier made visible: a stepped fill, never the raw age.
const SIZE = 14
const STROKE = 2.25
const CIRCUMFERENCE = 2 * Math.PI * ((SIZE - STROKE) / 2)

function ring(): HTMLElement {
  return screen.getByTestId('freshness-ring')
}

function fillCircle(): Element | null {
  return ring().querySelector('circle[stroke-dasharray]')
}

describe('FreshnessRing', () => {
  it.each([
    ['fresh', 1],
    ['aging', 0.75],
    ['stale', 0.5],
    ['expired', 0.25]
  ] as const)('fills the %s ring to %s of the circumference', (state, fraction) => {
    render(<FreshnessRing state={state} />)

    const dasharray = fillCircle()?.getAttribute('stroke-dasharray') ?? ''
    expect(Number(dasharray.split(' ')[0])).toBeCloseTo(fraction * CIRCUMFERENCE, 6)
  })

  it('carries the tier as data-state', () => {
    render(<FreshnessRing state="stale" />)

    expect(ring()).toHaveAttribute('data-state', 'stale')
  })

  it('draws a gold track with a centre dot and no fill for a reading that predates earnings', () => {
    render(<FreshnessRing state="predates_earnings" />)

    const circles = Array.from(ring().querySelectorAll('circle'))
    expect(fillCircle()).toBeNull()
    expect(circles[0]).toHaveAttribute('stroke', 'var(--wb-gold)')
    expect(circles.some((circle) => circle.getAttribute('fill') === 'var(--wb-gold)')).toBe(true)
  })

  it('draws a neutral track for an aged tier', () => {
    render(<FreshnessRing state="aging" />)

    expect(ring().querySelector('circle')).toHaveAttribute('stroke', 'var(--wb-border)')
  })

  // The tier is already spoken by the cell's aria-label; the ring would only repeat it.
  it('is hidden from assistive technology', () => {
    render(<FreshnessRing state="fresh" />)

    expect(ring()).toHaveAttribute('aria-hidden', 'true')
  })

  it('scales the geometry with the requested size', () => {
    render(<FreshnessRing state="fresh" size={12} />)

    const expected = 2 * Math.PI * ((12 - STROKE) / 2)
    const dasharray = fillCircle()?.getAttribute('stroke-dasharray') ?? ''
    expect(ring()).toHaveAttribute('width', '12')
    expect(Number(dasharray.split(' ')[0])).toBeCloseTo(expected, 6)
  })
})
