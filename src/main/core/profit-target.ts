// Profit target resolution.
// Pure engine — no database or broker imports allowed here.

export const DEFAULT_PROFIT_TARGET_PERCENT = 50

export function resolveProfitTarget(
  override: number | null,
  defaultPercent: number = DEFAULT_PROFIT_TARGET_PERCENT
): number {
  return override === null ? defaultPercent : override
}
