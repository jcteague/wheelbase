// [US-68] The gold strip that says where the pre-filled values came from, and when
// they were quoted. The form feeds it the fresh quote's time once the re-fetch lands,
// so the same component renders both the promoted and the refreshed provenance.
import { render, screen } from '@testing-library/react'
import { format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'
import { PromoteProvenance } from './PromoteProvenance'

const QUOTED_AT = '2026-08-07T20:00:02Z'
const FRESH_AT = '2026-08-07T20:11:40Z'

const localTime = (iso: string): string => format(parseISO(iso), 'HH:mm:ss')

describe('PromoteProvenance', () => {
  it('names the screener as the source of the pre-filled values', () => {
    render(<PromoteProvenance quotedAt={QUOTED_AT} />)

    expect(screen.getByTestId('promote-provenance')).toHaveTextContent('Promoted from Screener')
  })

  it('shows the promoted quote time', () => {
    render(<PromoteProvenance quotedAt={QUOTED_AT} />)

    expect(screen.getByTestId('promote-provenance')).toHaveTextContent(
      `Quoted ${localTime(QUOTED_AT)}`
    )
  })

  it('shows the fresh quote time instead once the re-fetch has landed', () => {
    render(<PromoteProvenance quotedAt={FRESH_AT} />)

    const strip = screen.getByTestId('promote-provenance')
    expect(strip).toHaveTextContent(`Quoted ${localTime(FRESH_AT)}`)
    expect(strip).not.toHaveTextContent(localTime(QUOTED_AT))
  })

  it('is styled with the gold promote tokens, not inline colors', () => {
    render(<PromoteProvenance quotedAt={QUOTED_AT} />)

    const strip = screen.getByTestId('promote-provenance')
    expect(strip.className).toContain('border-wb-gold-border')
    expect(strip.className).toContain('bg-wb-gold-subtle')
    expect(strip.getAttribute('style')).toBeNull()
  })
})
