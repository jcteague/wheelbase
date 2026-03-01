import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <h1>Wheelbase</h1>
        <p>Option Wheel Manager — coming soon.</p>
      </main>
    </QueryClientProvider>
  );
}
