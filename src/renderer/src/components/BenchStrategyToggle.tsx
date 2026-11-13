import { BENCH_STRATEGY_LABEL, type BenchStrategy } from '../lib/bench-strategy'
import { Segment, type SegmentOption } from './criteria-fields'

// [US-110] The bench's lens: Wheel screens for the best put per ticker, PMCC for the best
// LEAPS + short-call diagonal. The criteria sheet's own pill, so the two controls that
// pick between fixed options look and behave alike.

const OPTIONS: SegmentOption<BenchStrategy>[] = [
  { value: 'WHEEL', label: BENCH_STRATEGY_LABEL.WHEEL, testId: 'bench-strategy-wheel' },
  { value: 'PMCC', label: BENCH_STRATEGY_LABEL.PMCC, testId: 'bench-strategy-pmcc' }
]

type BenchStrategyToggleProps = {
  value: BenchStrategy
  onChange: (strategy: BenchStrategy) => void
}

export function BenchStrategyToggle({
  value,
  onChange
}: BenchStrategyToggleProps): React.JSX.Element {
  return (
    <div role="group" aria-label="Screening strategy" data-testid="bench-strategy">
      <Segment options={OPTIONS} value={value} onChange={onChange} />
    </div>
  )
}
