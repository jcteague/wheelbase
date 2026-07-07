// [US-58] Per-position alert-overrides service
import type Database from 'better-sqlite3'
import {
  MANAGEMENT_WINDOW_RANGE_MESSAGE,
  PROFIT_TARGET_RANGE_MESSAGE,
  isManagementWindowInRange,
  isProfitTargetInRange
} from '../core/alert-thresholds'
import { ValidationError } from '../core/lifecycle'
import { logger } from '../logger'

export type SavePositionAlertOverridesInput = {
  profitTargetPercent: number | null
  managementWindowDte: number | null
}

export type SavePositionAlertOverridesResult = {
  id: string
  profitTargetPercent: number | null
  managementWindowDteOverride: number | null
}

export function savePositionAlertOverrides(
  db: Database.Database,
  positionId: string,
  input: SavePositionAlertOverridesInput
): SavePositionAlertOverridesResult {
  if (input.profitTargetPercent !== null && !isProfitTargetInRange(input.profitTargetPercent)) {
    throw new ValidationError('profitTargetPercent', 'out_of_range', PROFIT_TARGET_RANGE_MESSAGE)
  }
  if (input.managementWindowDte !== null && !isManagementWindowInRange(input.managementWindowDte)) {
    throw new ValidationError(
      'managementWindowDte',
      'out_of_range',
      MANAGEMENT_WINDOW_RANGE_MESSAGE
    )
  }

  const result = db
    .prepare(
      'UPDATE positions SET profit_target_percent = ?, management_window_dte_override = ?, updated_at = ? WHERE id = ?'
    )
    .run(input.profitTargetPercent, input.managementWindowDte, new Date().toISOString(), positionId)

  if (result.changes === 0) {
    throw new ValidationError('__root__', 'not_found', 'Position not found')
  }

  logger.info({ positionId, ...input }, 'position_alert_overrides_saved')

  return {
    id: positionId,
    profitTargetPercent: input.profitTargetPercent,
    managementWindowDteOverride: input.managementWindowDte
  }
}
