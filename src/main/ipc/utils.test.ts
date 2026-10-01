import { describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod'
import { ValidationError } from '../core/lifecycle'
import { handleIpcCall } from './utils'

vi.mock('../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() }
}))

function zodErrorFrom(schema: z.ZodType, input: unknown): ZodError {
  const result = schema.safeParse(input)
  if (result.success) throw new Error('expected the schema to reject the input')
  return result.error
}

function throwing(err: unknown) {
  return (): object => {
    throw err
  }
}

describe('handleIpcCall field paths', () => {
  it('joins a nested Zod issue path with dots', async () => {
    const err = zodErrorFrom(z.object({ long: z.object({ fillPrice: z.number() }) }), {
      long: {}
    })
    const result = await handleIpcCall('test', throwing(err))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors[0].field).toBe('long.fillPrice')
  })

  it('keeps a single-segment Zod path as-is', async () => {
    const err = zodErrorFrom(z.object({ ticker: z.string() }), {})
    const result = await handleIpcCall('test', throwing(err))
    if (result.ok) throw new Error('expected failure')
    expect(result.errors[0].field).toBe('ticker')
  })

  it('maps an empty Zod path to __root__', async () => {
    const err = zodErrorFrom(z.string(), 42)
    const result = await handleIpcCall('test', throwing(err))
    if (result.ok) throw new Error('expected failure')
    expect(result.errors[0].field).toBe('__root__')
  })

  it('passes a dotted ValidationError field through untouched', async () => {
    const err = new ValidationError(
      'short.strike',
      'strike_not_above_long',
      'Short-call strike must be above the LEAPS strike.'
    )
    const result = await handleIpcCall('test', throwing(err))
    if (result.ok) throw new Error('expected failure')
    expect(result.errors).toEqual([
      {
        field: 'short.strike',
        code: 'strike_not_above_long',
        message: 'Short-call strike must be above the LEAPS strike.'
      }
    ])
  })
})
