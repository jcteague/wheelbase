// Shared bounds and messages for alert-threshold inputs (profit target %,
// management window DTE). Pure constants — imported by the IPC schemas, the DB
// services, and the renderer form schema so every validation layer stays in
// lockstep. Change a bound here and all five call sites move together.

export const PROFIT_TARGET_MIN = 1
export const PROFIT_TARGET_MAX = 99
export const MANAGEMENT_WINDOW_MIN = 6
export const MANAGEMENT_WINDOW_MAX = 45

export const PROFIT_TARGET_RANGE_MESSAGE = `Profit target must be between ${PROFIT_TARGET_MIN} and ${PROFIT_TARGET_MAX}`
export const MANAGEMENT_WINDOW_RANGE_MESSAGE = `Management window must be between ${MANAGEMENT_WINDOW_MIN} and ${MANAGEMENT_WINDOW_MAX} DTE`

/** True when a profit-target percent is within the inclusive allowed range. */
export function isProfitTargetInRange(value: number): boolean {
  return value >= PROFIT_TARGET_MIN && value <= PROFIT_TARGET_MAX
}

/** True when a management-window DTE is within the inclusive allowed range. */
export function isManagementWindowInRange(value: number): boolean {
  return value >= MANAGEMENT_WINDOW_MIN && value <= MANAGEMENT_WINDOW_MAX
}
