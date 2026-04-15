import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'

import { NavItem } from './components/NavItem'
import { NewWheelPage } from './pages/NewWheelPage'
import { PositionDetailPage } from './pages/PositionDetailPage'
import { PositionsListPage } from './pages/PositionsListPage'

const queryClient = new QueryClient()

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
      </nav>

      {/* Footer */}
      <div className="px-[16px] py-[12px] border-t border-wb-border text-[0.65rem] text-wb-text-muted font-wb-mono">
        Wheel Strategy
      </div>
    </aside>
  )
}

function AppShell(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-wb-bg-base text-wb-text-primary">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Switch>
          <Route path="/" component={PositionsListPage} />
          <Route path="/new" component={NewWheelPage} />
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
