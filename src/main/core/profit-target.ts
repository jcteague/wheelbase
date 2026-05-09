// Profit target resolution.
// Pure engine — no database or broker imports allowed here.

export const DEFAULT_PROFIT_TARGET_PERCENT = 50

export function resolveProfitTarget(override: number | null): number {
  return override === null ? DEFAULT_PROFIT_TARGET_PERCENT : override
}
