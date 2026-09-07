// [US-65] screener:results — the delivery surface US-66 reads. Every expected failure
// (provider outage, per-ticker data gaps) is modelled inside the success payload, so the
// envelope's error row only ever carries something genuinely unexpected.
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import type { MarketDataProvider } from '../integrations/market-data-provider'
import { screenWatchlistCandidates } from '../services/screener'
import { getScreeningCriteria, saveScreeningCriteria } from '../services/screening-criteria'
import { SaveScreeningCriteriaPayloadSchema } from '../schemas'
import { logger } from '../logger'
import { handleIpcCall } from './utils'

export function registerScreenerIpc({
  db,
  getProvider
}: {
  db: Database.Database
  getProvider: () => MarketDataProvider
}): void {
  // No payload, so no Zod request schema — see plans/us-65/contracts/screener-results.md.
  // [US-99] Construction never fails now: with no Alpaca credentials the chain pull raises
  // auth_failed per ticker, which rolls up to the modelled provider_unavailable state rather
  // than a generic internal_error.
  ipcMain.handle('screener:results', () =>
    handleIpcCall('screener_results_error', () => screenWatchlistCandidates(getProvider, db))
  )

  // [US-67] No payload — the read path degrades to the shipped defaults rather than
  // erroring, so there is nothing to validate. See contracts/screener-get-criteria.md.
  ipcMain.handle('screener:get-criteria', () =>
    handleIpcCall('screener_get_criteria_error', () => ({ criteria: getScreeningCriteria(db) }))
  )

  // The schema covers per-field bounds; the delta/DTE band rules are the service's,
  // which raises them with the `inverted_band` code the contract pins.
  ipcMain.handle('screener:save-criteria', (_, payload: unknown) =>
    handleIpcCall('screener_save_criteria_error', () => {
      const parsed = SaveScreeningCriteriaPayloadSchema.parse(payload)
      logger.debug(parsed, 'screener_save_criteria_requested')
      return { criteria: saveScreeningCriteria(db, parsed) }
    })
  )
}
