import { render, screen } from '@testing-library/react'
import { beforeEach, vi } from 'vitest'
import { App } from './App'
import { useSettingsStatus } from './hooks/useSettings'

vi.mock('./hooks/useSettings', () => ({
  useSettingsStatus: vi.fn()
}))

vi.mock('./pages/PositionsListPage', () => ({
  PositionsListPage: () => <div data-testid="positions-list-page" />
}))

vi.mock('./pages/NewWheelPage', () => ({
  NewWheelPage: () => <div data-testid="new-wheel-page" />
}))

vi.mock('./pages/PositionDetailPage', () => ({
  PositionDetailPage: () => <div data-testid="position-detail-page" />
}))

vi.mock('./pages/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page" />
}))

const mockUseSettingsStatus = vi.mocked(useSettingsStatus)

beforeEach(() => {
  window.location.hash = '#/'
  mockUseSettingsStatus.mockReturnValue({
    data: {
      marketData: 'configured',
      alpacaPaper: 'configured',
      alpacaLive: 'configured',
      activeBrokerEnv: 'paper',
      alpacaPaperAccountNumberMasked: 'PA…ABC',
      alpacaLiveAccountNumberMasked: 'AL…XYZ'
    },
    isLoading: false,
    isError: false,
    error: null
  } as ReturnType<typeof useSettingsStatus>)
})

describe('App — portal mount point', () => {
  it('renders a #sheet-portal div', () => {
    render(<App />)
    const portal = document.getElementById('sheet-portal')
    expect(portal).not.toBeNull()
  })

  it('#sheet-portal is a descendant of the app root, not a direct child of document.body', () => {
    render(<App />)
    const portal = document.getElementById('sheet-portal')
    expect(portal).not.toBeNull()
    expect(portal!.parentElement).not.toBe(document.body)
  })

  it('renders the header broker badge and market data dot on every page', () => {
    render(<App />)

    expect(screen.getByText('PAPER')).toBeInTheDocument()
    expect(screen.getByTestId('market-data-status-dot')).toBeInTheDocument()
  })

  // [US-99] The status query is empty on first paint; the dot must say "not connected"
  // rather than render an undefined state.
  it('falls back to a missing market-data status while the settings query is loading', () => {
    mockUseSettingsStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null
    } as ReturnType<typeof useSettingsStatus>)

    render(<App />)

    expect(screen.getByTestId('market-data-status-dot')).toHaveAttribute(
      'title',
      'Market data: connect Alpaca in Settings'
    )
  })

  it('renders SettingsPage at #/settings under the hash router', () => {
    window.location.hash = '#/settings'

    render(<App />)

    expect(screen.getByTestId('settings-page')).toBeInTheDocument()
  })
})
