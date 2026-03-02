import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { JSX } from 'preact';
import { Route, Switch } from 'wouter';

import { NewWheelPage } from './pages/NewWheelPage';
import { PositionDetailPage } from './pages/PositionDetailPage';

const queryClient = new QueryClient();

export function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        <Route path="/" component={NewWheelPage} />
        <Route path="/positions/:id" component={PositionDetailPage} />
      </Switch>
    </QueryClientProvider>
  );
}
