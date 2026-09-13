import type { Gate } from '../api/watchlist'
import { Badge } from './ui/Badge'

// [US-96] One entry condition with its verdict, as a badge.
//
// The condition is stated in full beside the verdict rather than reduced to a pass/fail
// mark: a trader reading "not met" needs to see *which* threshold was not met without
// opening the edit form.

export type DecidedVerdict = Exclude<Gate['verdict'], 'none'>

/** A gate that actually reached a verdict. A `none` gate means the trader set no such
 *  condition, so there is nothing to badge — callers drop those before they get here, and
 *  saying so in the type keeps this component from carrying a branch that cannot run. */
export type DecidedGate = Gate & { verdict: DecidedVerdict }

type GateBadgeProps = {
  testId: string
  /** The condition as the trader wrote it — `≤ $170`, `IVR ≥ 50`, `Post-earnings only`. */
  condition: string
  gate: DecidedGate
}

const VERDICT_WORD: Record<DecidedVerdict, string> = {
  met: 'met',
  unmet: 'not met',
  unknown: 'unknown'
}

// An unknown is muted, never gold: gold is the treatment for a condition the stock
// genuinely failed, and a refusal to decide must not be mistaken for one. `unmet` keeps
// the default gold, so it is absent here.
const VERDICT_COLOR: Partial<Record<DecidedVerdict, string>> = {
  met: 'var(--wb-green)',
  unknown: 'var(--wb-text-muted)'
}

export function GateBadge({ testId, condition, gate }: GateBadgeProps): React.JSX.Element {
  return (
    <Badge data-testid={testId} data-verdict={gate.verdict} color={VERDICT_COLOR[gate.verdict]}>
      {condition} · {VERDICT_WORD[gate.verdict]}
    </Badge>
  )
}
