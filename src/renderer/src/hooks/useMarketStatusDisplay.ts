import type { UseQueryResult } from '@tanstack/react-query'
import type { MarketStatus } from '../api/market-data'
import type { ApiError } from '../api/error'
import type { CredentialStatus } from '../api/settings'
import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import { deriveMarketStatusDisplay } from '../lib/market-status'
import { useMarketStatus } from './useMarketStatus'
import { useSettingsStatus } from './useSettings'

type MarketStatusDisplayResult = {
  settingsQuery: UseQueryResult<CredentialStatus, ApiError>
  hasMarketData: boolean
  statusQuery: UseQueryResult<MarketStatus, ApiError>
  display: MarketStatusDisplay
}

/** Shared settingsQuery -> hasMarketData -> useMarketStatus -> display wiring used by any
 *  page showing a MarketStatusPill. The session is a market fact, so the query is gated on
 *  market-data credentials rather than on an optional broker. */
export function useMarketStatusDisplay(stale = false): MarketStatusDisplayResult {
  const settingsQuery = useSettingsStatus()
  const hasMarketData = settingsQuery.data?.marketData === 'configured'
  const statusQuery = useMarketStatus(hasMarketData)
  const display = deriveMarketStatusDisplay(statusQuery.data?.session, stale)

  return { settingsQuery, hasMarketData, statusQuery, display }
}
