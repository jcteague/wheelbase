// [US-104] PmccRollNetPreview — the roll's net card. Its label and the replacement's DTE are
// separate props: the DTE suffix is shown only when a DTE is known.
import { render, screen } from '@testing-library/react'
import { pmccRollNet } from '../lib/pmcc-roll'
import { PmccRollNetPreview } from './PmccRollNetPreview'

const LABEL = 'Roll Up & Out: $108 to $112 strike, Nov to Dec expiration'

function renderPreview(replacementDte: number | null): void {
  render(
    <PmccRollNetPreview
      net={pmccRollNet({ received: '2.40', paid: '3.00', contracts: 1 })}
      postRoll={{ postBasis: '21.80', effectiveAfter: '101.80' }}
      label={LABEL}
      replacementDte={replacementDte}
      basisPerShare="21.2000"
      effectiveShareCost="101.2000"
    />
  )
}

describe('PmccRollNetPreview — roll label', () => {
  it('appends the replacement DTE to the label when it is known', () => {
    renderPreview(42)
    expect(screen.getByTestId('pmcc-roll-label')).toHaveTextContent(`${LABEL} · 42 DTE`)
  })

  it('shows the bare label, with no DTE suffix, when the DTE is unknown', () => {
    renderPreview(null)
    const label = screen.getByTestId('pmcc-roll-label')
    expect(label).toHaveTextContent(LABEL)
    expect(label).not.toHaveTextContent('DTE')
  })
})
