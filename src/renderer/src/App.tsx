import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'

import { EnvironmentBadge } from './components/EnvironmentBadge'
import { MarketDataStatusDot } from './components/MarketDataStatusDot'
import { NavItem } from './components/NavItem'
import { useSettingsStatus } from './hooks/useSettings'
import { CALENDAR_PAGE_TITLE, CalendarPage } from './pages/CalendarPage'
import { NewWheelPage } from './pages/NewWheelPage'
import { PositionDetailPage } from './pages/PositionDetailPage'
import { PositionsListPage } from './pages/PositionsListPage'
import { SCREENER_PAGE_TITLE, ScreenerPage } from './pages/ScreenerPage'
import { SettingsPage } from './pages/SettingsPage'
import { WATCHLIST_PAGE_TITLE, WatchlistPage } from './pages/WatchlistPage'

const queryClient = new QueryClient()

/** Shell-header title per route; anything unmapped (`/`, `/positions/:id`) falls back to Dashboard. */
const PAGE_TITLES: Record<string, string | undefined> = {
  '/settings': 'Settings',
  '/new': 'Open Wheel',
  '/calendar': CALENDAR_PAGE_TITLE,
  '/watchlist': WATCHLIST_PAGE_TITLE,
  '/screener': SCREENER_PAGE_TITLE
}

function Sidebar(): React.JSX.Element {
  const [location] = useLocation()

  return (
    <aside className="flex flex-col bg-wb-bg-surface border-r border-wb-border h-screen w-[200px] min-w-[200px]">
      {/* Logo */}
      <div className="flex items-center gap-[8px] px-[16px] py-[16px] border-b border-wb-border">
        <div
          className="bg-wb-gold rounded-full w-2 h-2"
          style={{ boxShadow: '0 0 6px var(--wb-gold)' }}
        />
        <span className="font-bold tracking-[0.15em] uppercase text-xs text-wb-text-primary font-wb-mono">
          Wheelbase
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-[4px] px-[8px] py-[16px] flex-1">
        <div className="px-[12px] py-[6px] mb-[4px] text-[0.65rem] font-semibold tracking-[0.1em] uppercase text-wb-text-muted font-wb-mono">
          Trading
        </div>
        <NavItem href="/" label="Positions" icon="◈" active={location === '/' || location === ''} />
        <NavItem href="/new" label="Open Wheel" icon="+" active={location === '/new'} />
        <NavItem
          href="/calendar"
          label={CALENDAR_PAGE_TITLE}
          icon="▦"
          active={location === '/calendar'}
        />
        <NavItem
          href="/watchlist"
          label={WATCHLIST_PAGE_TITLE}
          icon="☰"
          active={location === '/watchlist'}
        />
        <NavItem
          href="/screener"
          label={SCREENER_PAGE_TITLE}
          icon="⌕"
          active={location === '/screener'}
        />
        <div className="px-[12px] py-[6px] mb-[4px] mt-[12px] text-[0.65rem] font-semibold tracking-[0.1em] uppercase text-wb-text-muted font-wb-mono">
          System
        </div>
        <NavItem href="/settings" label="Settings" icon="⚙" active={location === '/settings'} />
      </nav>

      {/* Footer */}
      <div className="px-[16px] py-[12px] border-t border-wb-border text-[0.65rem] text-wb-text-muted font-wb-mono">
        Wheel Strategy
      </div>
    </aside>
  )
}

function ShellHeader(): React.JSX.Element {
  const [location] = useLocation()
  const { data } = useSettingsStatus()
  const activeBrokerEnv = data?.activeBrokerEnv ?? 'none'
  const marketData = data?.marketData ?? 'missing'
  const title = PAGE_TITLES[location] ?? 'Dashboard'

  return (
    <div className="flex items-center justify-between border-b border-wb-border bg-wb-bg-surface px-6 py-3">
      <div className="font-wb-mono text-[0.72rem] uppercase tracking-[0.12em] text-wb-text-muted">
        {title}
      </div>
      <div className="flex items-center gap-3">
        <EnvironmentBadge activeBrokerEnv={activeBrokerEnv} />
        <MarketDataStatusDot marketData={marketData} />
      </div>
    </div>
  )
}

function AppShell(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-wb-bg-base text-wb-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <ShellHeader />
        <Switch>
          <Route path="/" component={PositionsListPage} />
          <Route path="/new" component={NewWheelPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route path="/screener" component={ScreenerPage} />
          <Route path="/positions/:id" component={PositionDetailPage} />
        </Switch>
      </main>
      <div id="sheet-portal" />
    </div>
  )
}

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <AppShell />
      </Router>
    </QueryClientProvider>
  )
}
