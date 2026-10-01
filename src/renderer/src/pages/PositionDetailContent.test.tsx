import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { PositionDetail } from '../api/positions'
import { PositionDetailContent } from './PositionDetailContent'

vi.mock('../components/PositionAlertOverridesForm', () => ({
  PositionAlertOverridesForm: () => <div data-testid="position-alert-overrides-form" />
}))

vi.mock('../components/position-cockpit/PositionCockpit', () => ({
  PositionCockpit: () => <div data-testid="position-cockpit" />
}))

vi.mock('../components/CloseCspForm', () => ({
  CloseCspForm: () => <div data-testid="close-csp-form" />
}))

const WHEEL_DETAIL: PositionDetail = {
  position: {
    id: 'pos-1',
    ticker: 'AAPL',
    phase: 'HOLDING_SHARES',
    status: 'ACTIVE',
    strategyType: 'WHEEL',
    openedDate: '2026-09-01',
    closedDate: null,
    accountId: null,
    notes: null,
    thesis: null,
    tags: [],
    profitTargetPercent: null,
    managementWindowDteOverride: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z'
  },
  activeLeg: null,
  costBasisSnapshot: null,
  legs: [],
  allSnapshots: [],
  initialNetDebit: null
}

const PMCC_DETAIL: PositionDetail = {
  ...WHEEL_DETAIL,
  position: { ...WHEEL_DETAIL.position, ticker: 'XYZ', phase: 'PMCC_OPEN', strategyType: 'PMCC' }
}

it('renders the alert overrides form for a wheel', () => {
  render(<PositionDetailContent detail={WHEEL_DETAIL} overlayOpen={false} />)
  expect(screen.getByTestId('position-cockpit')).toBeInTheDocument()
  expect(screen.getByTestId('position-alert-overrides-form')).toBeInTheDocument()
})

it('hides the alert overrides form for a PMCC', () => {
  render(<PositionDetailContent detail={PMCC_DETAIL} overlayOpen={false} />)
  expect(screen.getByTestId('position-cockpit')).toBeInTheDocument()
  expect(screen.queryByTestId('position-alert-overrides-form')).not.toBeInTheDocument()
})
