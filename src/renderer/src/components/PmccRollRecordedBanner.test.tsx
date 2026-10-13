// [US-104] [US-105] The confirmation above a PMCC once a short-call or LEAPS roll is recorded.
import { render, screen } from '@testing-library/react'
import { LEAPS_UP_OUT_RESPONSE } from '../test-fixtures/pmcc-leaps-roll'
import { OUT_CREDIT_RESPONSE, UP_OUT_RESPONSE } from '../test-fixtures/pmcc-roll'
import { PmccRollRecordedBanner } from './PmccRollRecordedBanner'

describe('PmccRollRecordedBanner — short call', () => {
  it('reads the bought-to-close and sold legs with the debit net', () => {
    render(<PmccRollRecordedBanner recorded={{ kind: 'short', result: UP_OUT_RESPONSE }} />)
    expect(screen.getByTestId('pmcc-roll-recorded-banner')).toHaveTextContent(
      'Rolled — bought to close XYZ $108.00 CALL 2026-11-20 at $3.00, sold XYZ $112.00 CALL 2026-12-18 at $2.40. Short-call roll #1 debit · $0.60 per share ($60.00 total). Both legs share one roll chain.'
    )
  })

  it('reads credit when the new call pays more than the close costs', () => {
    render(<PmccRollRecordedBanner recorded={{ kind: 'short', result: OUT_CREDIT_RESPONSE }} />)
    expect(screen.getByTestId('pmcc-roll-recorded-banner')).toHaveTextContent(
      'Short-call roll #1 credit · $1.20 per share ($120.00 total).'
    )
  })

  it('reads even when the new call pays exactly what the close costs', () => {
    const even = {
      ...UP_OUT_RESPONSE,
      rollToLeg: { ...UP_OUT_RESPONSE.rollToLeg, premiumPerContract: '3.0000' }
    }
    render(<PmccRollRecordedBanner recorded={{ kind: 'short', result: even }} />)
    expect(screen.getByTestId('pmcc-roll-recorded-banner')).toHaveTextContent(
      'Short-call roll #1 even · $0.00 per share ($0.00 total).'
    )
  })
})

describe('PmccRollRecordedBanner — LEAPS', () => {
  it('reads the sold-to-close and bought-to-open legs with the credit net', () => {
    render(<PmccRollRecordedBanner recorded={{ kind: 'leaps', result: LEAPS_UP_OUT_RESPONSE }} />)
    expect(screen.getByTestId('pmcc-leaps-roll-recorded-banner')).toHaveTextContent(
      'Rolled — sold to close XYZ $80.00 CALL 2027-09-17 at $26.00, bought to open XYZ $85.00 CALL 2028-01-21 at $23.50. LEAPS roll #1 credit · $2.50 per share ($250.00 total). Both legs share one roll chain. Effective share cost if exercised: $104.30 — the $85.00 strike plus $19.30 basis.'
    )
    expect(screen.queryByTestId('pmcc-roll-recorded-banner')).not.toBeInTheDocument()
  })

  it('reads debit when the replacement costs more than the close returns', () => {
    const debit = {
      ...LEAPS_UP_OUT_RESPONSE,
      leapsRollNumber: 2,
      rollToLeg: {
        ...LEAPS_UP_OUT_RESPONSE.rollToLeg,
        premiumPerContract: '29.2000',
        contracts: 2
      },
      rollFromLeg: { ...LEAPS_UP_OUT_RESPONSE.rollFromLeg, contracts: 2 }
    }
    render(<PmccRollRecordedBanner recorded={{ kind: 'leaps', result: debit }} />)
    expect(screen.getByTestId('pmcc-leaps-roll-recorded-banner')).toHaveTextContent(
      'LEAPS roll #2 debit · $3.20 per share ($640.00 total). Both legs share one roll chain. Effective share cost if exercised: $104.30 — the $85.00 strike plus $19.30 basis.'
    )
  })

  it('reads even when the replacement costs exactly what the close returns', () => {
    const even = {
      ...LEAPS_UP_OUT_RESPONSE,
      rollToLeg: { ...LEAPS_UP_OUT_RESPONSE.rollToLeg, premiumPerContract: '26.0000' }
    }
    render(<PmccRollRecordedBanner recorded={{ kind: 'leaps', result: even }} />)
    expect(screen.getByTestId('pmcc-leaps-roll-recorded-banner')).toHaveTextContent(
      'LEAPS roll #1 even · $0.00 per share ($0.00 total).'
    )
  })
})
