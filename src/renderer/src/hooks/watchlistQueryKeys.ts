export const watchlistQueryKeys = {
  all: ['watchlist'] as const,
  // Nested under `all` so any watchlist mutation invalidates the bench by prefix too.
  snapshot: ['watchlist', 'snapshot'] as const
}
