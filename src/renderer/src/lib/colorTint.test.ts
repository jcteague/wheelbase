import { describe, expect, it } from 'vitest'
import { tintFromColor } from './colorTint'

describe('tintFromColor', () => {
  it('derives a translucent background and border from a solid hex color', () => {
    expect(tintFromColor('#e6a817')).toEqual({
      background: '#e6a81718',
      border: '1px solid #e6a81730',
      color: '#e6a817'
    })
  })
})
