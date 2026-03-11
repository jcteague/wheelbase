import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Switch } from 'wouter'

import { NewWheelPage } from './pages/NewWheelPage'
import { PositionDetailPage } from './pages/PositionDetailPage'
import { PositionsListPage } from './pages/PositionsListPage'

const queryClient = new QueryClient()

export function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark min-h-screen bg-background text-foreground">
        <Switch>
          <Route path="/" component={NewWheelPage} />
          <Route path="/positions" component={PositionsListPage} />
          <Route path="/positions/:id" component={PositionDetailPage} />
        </Switch>
      </div>
    </QueryClientProvider>
  )
}
