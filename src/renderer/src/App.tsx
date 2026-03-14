import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'

import { NavItem } from './components/NavItem'
import { MONO } from './lib/tokens'
import { NewWheelPage } from './pages/NewWheelPage'
import { PositionDetailPage } from './pages/PositionDetailPage'
import { PositionsListPage } from './pages/PositionsListPage'

const queryClient = new QueryClient()

function Sidebar(): React.JSX.Element {
  const [location] = useLocation()

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 200,
        minWidth: 200,
        background: 'var(--wb-bg-surface)',
        borderRight: '1px solid var(--wb-border)',
        height: '100vh'
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-4 py-4"
        style={{ borderBottom: '1px solid var(--wb-border)' }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--wb-gold)',
            boxShadow: '0 0 6px var(--wb-gold)'
          }}
        />
        <span
          className="font-bold tracking-widest uppercase text-xs"
          style={{
            color: 'var(--wb-text-primary)',
            fontFamily: MONO,
            letterSpacing: '0.15em'
          }}
        >
          Wheelbase
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-2 py-4" style={{ flex: 1 }}>
        <div
          className="px-3 py-1.5 mb-1"
          style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--wb-text-muted)',
            fontFamily: MONO
          }}
        >
          Trading
        </div>
        <NavItem href="/" label="Positions" icon="◈" active={location === '/' || location === ''} />
        <NavItem href="/new" label="Open Wheel" icon="+" active={location === '/new'} />
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3"
        style={{
          borderTop: '1px solid var(--wb-border)',
          fontSize: '0.65rem',
          color: 'var(--wb-text-muted)',
          fontFamily: MONO
        }}
      >
        Wheel Strategy
      </div>
    </aside>
  )
}

function AppShell(): React.JSX.Element {
  return (
    <div
      className="flex"
      style={{ height: '100vh', background: 'var(--wb-bg-base)', color: 'var(--wb-text-primary)' }}
    >
      <Sidebar />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Switch>
          <Route path="/" component={PositionsListPage} />
          <Route path="/new" component={NewWheelPage} />
          <Route path="/positions/:id" component={PositionDetailPage} />
        </Switch>
      </main>
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
