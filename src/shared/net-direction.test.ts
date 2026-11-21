import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { netDirection } from './net-direction'

describe('netDirection', () => {
  it.each([
    ['-0.0001', 'debit'],
    ['0.0000', 'even'],
    ['0.0001', 'credit']
  ])('reads a net of %s as %s', (net, direction) => {
    expect(netDirection(new Decimal(net))).toBe(direction)
  })
})
