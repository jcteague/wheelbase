// [US-57] Global alert-defaults service — reads/writes app_settings keys.
import type Database from 'better-sqlite3'
import { DEFAULT_PROFIT_TARGET_PERCENT } from '../core/profit-target'
import { DEFAULT_MANAGEMENT_WINDOW_DTE } from '../core/alerts'
import {
  MANAGEMENT_WINDOW_RANGE_MESSAGE,
  PROFIT_TARGET_RANGE_MESSAGE,
  isManagementWindowInRange,
  isProfitTargetInRange
} from '../core/alert-thresholds'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'
import { appSettings } from './app-settings'

const PROFIT_TARGET_KEY = 'alert_default_profit_target_percent'
const MANAGEMENT_WINDOW_KEY = 'alert_default_management_window_dte'

export type AlertDefaults = { profitTargetPercent: number; managementWindowDte: number }

/** Coerce a stored setting to a number, falling back when absent or non-numeric
 *  (e.g. a corrupt row) — never returns NaN, which would silently disable the rule. */
function toNumberOr(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getAlertDefaults(db: Database.Database): AlertDefaults {
  const profit = appSettings.get(db, PROFIT_TARGET_KEY)
  const window = appSettings.get(db, MANAGEMENT_WINDOW_KEY)
  return {
    profitTargetPercent: toNumberOr(profit, DEFAULT_PROFIT_TARGET_PERCENT),
    managementWindowDte: toNumberOr(window, DEFAULT_MANAGEMENT_WINDOW_DTE)
  }
}

export function saveAlertDefaults(db: Database.Database, input: AlertDefaults): AlertDefaults {
  if (!isProfitTargetInRange(input.profitTargetPercent)) {
    throw new ValidationError('profitTargetPercent', 'out_of_range', PROFIT_TARGET_RANGE_MESSAGE)
  }
  if (!isManagementWindowInRange(input.managementWindowDte)) {
    throw new ValidationError(
      'managementWindowDte',
      'out_of_range',
      MANAGEMENT_WINDOW_RANGE_MESSAGE
    )
  }

  appSettings.set(db, PROFIT_TARGET_KEY, String(input.profitTargetPercent))
  appSettings.set(db, MANAGEMENT_WINDOW_KEY, String(input.managementWindowDte))
  logger.info({ ...input }, 'alert_defaults_saved')
  return getAlertDefaults(db)
}
