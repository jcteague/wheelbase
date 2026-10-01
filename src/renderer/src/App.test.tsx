import { act, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, vi } from 'vitest'
import { useLocation, useSearch } from 'wouter'
import { navigate } from 'wouter/use-hash-location'
import { App } from './App'
import { useSettingsStatus } from './hooks/useSettings'

vi.mock('./hooks/useSettings', () => ({
  useSettingsStatus: vi.fn()
}))

const { listPageMounts } = vi.hoisted(() => ({ listPageMounts: vi.fn() }))

// Reports what the page reads from the router, and counts its own mounts so a
// remount on the `/` ↔ `/new` flip would be visible.
vi.mock('./pages/PositionsListPage', () => ({
  PositionsListPage: function MockPositionsListPage() {
    const [location] = useLocation()
    const search = useSearch()
    useEffect(() => listPageMounts(), [])
    return <div data-testid="positions-list-page" data-location={location} data-search={search} />
  }
}))

vi.mock('./pages/PositionDetailPage', () => ({
  PositionDetailPage: () => <div data-testid="position-detail-page" />
}))

vi.mock('./pages/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page" />
}))

// [US-96] The combined bench reaches for the snapshot and screener queries on mount;
// the shell only needs to know the route resolves to it.
vi.mock('./pages/WatchlistPage', () => ({
  WATCHLIST_PAGE_TITLE: 'Watchlist',
  WatchlistPage: () => <div data-testid="watchlist-page" />
}))

const mockUseSettingsStatus = vi.mocked(useSettingsStatus)

beforeEach(() => {
  listPageMounts.mockReset()
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

// [US-96] The screener moved onto the Watchlist page, so /screener is gone: no nav
// item, no route, and no shell title of its own.
describe('App — the screener lives on the Watchlist page', () => {
  it('offers no Screener nav link', () => {
    render(<App />)

    expect(document.querySelector('a[href="#/screener"]')).toBeNull()
    expect(screen.queryByText('Screener')).not.toBeInTheDocument()
  })

  it('renders the combined watchlist page at #/watchlist', () => {
    window.location.hash = '#/watchlist'

    render(<App />)

    expect(screen.getByTestId('watchlist-page')).toBeInTheDocument()
  })

  // PAGE_TITLES no longer maps /screener, so the retired hash gets the shell default.
  it('falls back to the Dashboard title for the retired /screener hash', () => {
    window.location.hash = '#/screener'

    render(<App />)

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })
})

// [US-101] `#/new` is the positions list with the New position sheet open, not a page
// of its own — one route, so the list is never remounted when the sheet opens or closes.
describe('App — /new renders the positions list', () => {
  it.each(['#/', '#/new'])('renders PositionsListPage at %s', (hash) => {
    window.location.hash = hash

    render(<App />)

    expect(screen.getByTestId('positions-list-page')).toHaveAttribute(
      'data-location',
      hash.slice(1)
    )
  })

  // `CallAwaySuccess` writes the query into the hash itself (`#/new?ticker=`), so the
  // route must match a location that still carries it; the page splits it off.
  it('routes a hash-embedded ?ticker= to the page', () => {
    window.location.hash = '#/new?ticker=AAPL'

    render(<App />)

    expect(screen.getByTestId('positions-list-page')).toHaveAttribute(
      'data-location',
      '/new?ticker=AAPL'
    )
  })

  // `ExpirationSheet` and the screener promote go through wouter's hash `navigate`, which
  // writes the query into the real `location.search` instead.
  it('hands the page a navigate()-written ?ticker= search', async () => {
    render(<App />)

    await act(async () => navigate('/new?ticker=AAPL'))

    const page = screen.getByTestId('positions-list-page')
    expect(page).toHaveAttribute('data-location', '/new')
    expect(page).toHaveAttribute('data-search', 'ticker=AAPL')
    window.history.replaceState(null, '', window.location.pathname)
  })

  it('keeps the same page instance across the / ↔ /new flip', async () => {
    window.location.hash = '#/'
    render(<App />)

    await act(async () => {
      window.location.hash = '#/new'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByTestId('positions-list-page')).toHaveAttribute('data-location', '/new')

    await act(async () => {
      window.location.hash = '#/'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByTestId('positions-list-page')).toHaveAttribute('data-location', '/')
    expect(listPageMounts).toHaveBeenCalledOnce()
  })
})
