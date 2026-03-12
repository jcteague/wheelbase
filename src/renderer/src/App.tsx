import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Router, Switch } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'

import { NewWheelPage } from './pages/NewWheelPage'
import { PositionDetailPage } from './pages/PositionDetailPage'
import { PositionsListPage } from './pages/PositionsListPage'

const queryClient = new QueryClient()

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Router hook={useHashLocation}>
        <div className="dark min-h-screen bg-background text-foreground">
          <Switch>
            <Route path="/" component={NewWheelPage} />
            <Route path="/positions" component={PositionsListPage} />
            <Route path="/positions/:id" component={PositionDetailPage} />
          </Switch>
        </div>
      </Router>
    </QueryClientProvider>
  )
}
