// [US-109] The leg timeline's coverage strip copy and placement, over the XYZ Background's axis
// (2026-09-14 to the held LEAPS's 2028-01-21 expiration: 494 calendar days).
import { describe, expect, it } from 'vitest'
import {
  cycleSegmentEnd,
  rollTickLabel,
  stripCaption,
  stripLeapsLabel,
  stripPlacement,
  stripRange,
  todayMarker,
  type StripRange
} from './pmcc-coverage-strip'

const AXIS: StripRange = { start: '2026-09-14', end: '2028-01-21' }

describe('stripRange', () => {
  it('runs from the first LEAPS fill to the expiration of the LEAPS held now', () => {
    expect(
      stripRange({
        start: '2026-09-14',
        leapsTrack: { current: { strike: '85.0000', expiration: '2028-01-21' } }
      })
    ).toEqual(AXIS)
  })
})

describe('strip copy', () => {
  it('captions the axis', () => {
    expect(stripCaption(AXIS)).toBe('Coverage · 2026-09-14 to 2028-01-21')
  })

  it('labels the LEAPS bar with the contract held now', () => {
    expect(stripLeapsLabel({ strike: '85.0000', expiration: '2028-01-21' })).toBe(
      'LEAPS $85.00 call · 2028-01-21'
    )
  })

  it('names a LEAPS roll tick by its date', () => {
    expect(rollTickLabel('2027-07-09')).toBe('LEAPS roll · 2027-07-09')
  })

  it('marks the valuation date as today', () => {
    expect(todayMarker('2027-08-13')).toBe('today 2027-08-13')
  })
})

describe('stripPlacement', () => {
  // Expected percentages are calendar days ÷ 494, to 3 dp.
  it('places a span that starts on the axis start at 0%', () => {
    expect(stripPlacement(AXIS, '2026-09-14', '2026-10-16')).toEqual({
      left: '0.000%',
      width: '6.478%'
    })
  })

  it('places a span inside the axis by its calendar days', () => {
    expect(stripPlacement(AXIS, '2027-07-23', '2027-08-13')).toEqual({
      left: '63.158%',
      width: '4.251%'
    })
  })

  it('places a single day with zero width', () => {
    expect(stripPlacement(AXIS, '2027-07-09', '2027-07-09')).toEqual({
      left: '60.324%',
      width: '0.000%'
    })
  })

  it('clips a span that starts before the axis to its start', () => {
    expect(stripPlacement(AXIS, '2026-09-01', '2026-09-20')).toEqual({
      left: '0.000%',
      width: '1.215%'
    })
  })

  it('clips a span that runs past the axis to its end', () => {
    expect(stripPlacement(AXIS, '2028-01-01', '2028-03-01')).toEqual({
      left: '95.951%',
      width: '4.049%'
    })
  })

  it('pins a date after the axis to its end', () => {
    expect(stripPlacement(AXIS, '2028-02-01', '2028-02-01')).toEqual({
      left: '100.000%',
      width: '0.000%'
    })
  })
})

describe('cycleSegmentEnd', () => {
  it('ends an ended cycle on the day it ended', () => {
    expect(cycleSegmentEnd({ status: 'ENDED', endedOn: '2027-04-02' }, '2027-08-13')).toBe(
      '2027-04-02'
    )
  })

  it('ends an open cycle at the window end', () => {
    expect(cycleSegmentEnd({ status: 'OPEN' }, '2027-08-13')).toBe('2027-08-13')
  })

  it('ends a cycle with no recorded outcome at its expiration, not the window end', () => {
    expect(cycleSegmentEnd({ status: 'UNRECORDED', expiredOn: '2027-08-20' }, '2027-08-24')).toBe(
      '2027-08-20'
    )
  })
})
