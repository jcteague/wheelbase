// [US-110] Which lens the bench screens through. Session state only — never persisted.
export type BenchStrategy = 'WHEEL' | 'PMCC'

export const BENCH_STRATEGY_LABEL: Record<BenchStrategy, string> = {
  WHEEL: 'Wheel',
  PMCC: 'PMCC'
}
