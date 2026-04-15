import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect } from 'vitest'
import { MONO } from './tokens'

const CSS_PATH = join(__dirname, '../index.css')

describe('index.css wb-* token integration', () => {
  let source: string

  beforeEach(() => {
    source = readFileSync(CSS_PATH, 'utf-8')
  })

  it('contains --color-wb-gold in @theme inline block', () => {
    expect(source).toContain('--color-wb-gold')
  })

  it('contains --color-wb-green in @theme inline block', () => {
    expect(source).toContain('--color-wb-green')
  })

  it('contains --color-wb-text-primary in @theme inline block', () => {
    expect(source).toContain('--color-wb-text-primary')
  })

  it('contains --font-wb-mono in @theme inline block', () => {
    expect(source).toContain('--font-wb-mono')
  })

  it('contains --shadow-sheet in @theme inline block', () => {
    expect(source).toContain('--shadow-sheet')
  })
})

describe('tokens.ts MONO constant', () => {
  it('MONO matches the full font stack used in --font-wb-mono (regression guard)', () => {
    expect(MONO).toBe("ui-monospace, 'SF Mono', Menlo, 'Cascadia Code', 'Fira Code', monospace")
  })
})
