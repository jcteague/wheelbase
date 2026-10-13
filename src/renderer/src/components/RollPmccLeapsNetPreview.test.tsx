import { render, screen } from '@testing-library/react'
import { pmccRollNet } from '../lib/pmcc-roll'
import { LEAPS_LEDGER } from '../test-fixtures/pmcc-leaps-roll'
import { RollPmccLeapsNetPreview } from './RollPmccLeapsNetPreview'

const POST_ROLL = { postBasis: '19.30', leapsCostAfter: '22.50', effectiveAfter: '104.30' }

describe('RollPmccLeapsNetPreview', () => {
  it('a credit with an unreadable strike does not claim the strike moved up', () => {
    render(
      <RollPmccLeapsNetPreview
        net={pmccRollNet({ received: '26.00', paid: '23.50', contracts: 1 })}
        postRoll={POST_ROLL}
        label={null}
        newStrike="abc"
        currentStrike="80.0000"
        ledger={LEAPS_LEDGER}
      />
    )
    expect(screen.getByText(/Cash came out; it lowers the basis\./)).toBeInTheDocument()
  })
})
