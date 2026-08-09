// [US-65] screener:results — the delivery surface US-66 reads. Every expected failure
// (provider outage, per-ticker data gaps) is modelled inside the success payload, so the
// envelope's error row only ever carries something genuinely unexpected.
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { screenWatchlistCandidates } from '../services/screener'
import { handleIpcCall } from './utils'

export function registerScreenerIpc({
  db,
  getProvider
}: {
  db: Database.Database
  getProvider: () => MarketDataProvider
}): void {
  // No payload, so no Zod request schema — see plans/us-65/contracts/screener-results.md.
  // The provider resolves inside the service so an unconfigured provider surfaces as
  // the modelled provider_unavailable state, not a generic internal_error.
  ipcMain.handle('screener:results', () =>
    handleIpcCall('screener_results_error', () => screenWatchlistCandidates(getProvider, db))
  )
}
