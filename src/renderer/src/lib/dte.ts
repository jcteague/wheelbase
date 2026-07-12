export const DTE_URGENT_THRESHOLD = 7

export function isDteUrgent(dte: number | null): boolean {
  return dte !== null && dte <= DTE_URGENT_THRESHOLD
}
