import type { UseQueryResult } from '@tanstack/react-query'
import type { MarketStatus } from '../api/broker'
import type { ApiError } from '../api/error'
import type { CredentialStatus } from '../api/settings'
import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import { deriveMarketStatusDisplay } from '../lib/market-status'
import { useMarketStatus } from './useMarketStatus'
import { useSettingsStatus } from './useSettings'

type MarketStatusDisplayResult = {
  settingsQuery: UseQueryResult<CredentialStatus, ApiError>
  hasBroker: boolean
  statusQuery: UseQueryResult<MarketStatus, ApiError>
  display: MarketStatusDisplay
}

/** Shared settingsQuery -> hasBroker -> useMarketStatus -> display wiring used by any page showing a MarketStatusPill. */
export function useMarketStatusDisplay(stale = false): MarketStatusDisplayResult {
  const settingsQuery = useSettingsStatus()
  const hasBroker = settingsQuery.data?.activeBrokerEnv !== 'none'
  const statusQuery = useMarketStatus(hasBroker)
  const display = deriveMarketStatusDisplay(statusQuery.data?.session, stale)

  return { settingsQuery, hasBroker, statusQuery, display }
}
