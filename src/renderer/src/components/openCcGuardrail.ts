export type GuardrailResult =
  | { type: 'below' | 'at'; message: string }
  | { type: 'above'; message: string }
  | null

export function computeGuardrail(strikeStr: string, basisStr: string): GuardrailResult {
  const strike = parseFloat(strikeStr)
  const basis = parseFloat(basisStr)
  if (isNaN(strike) || isNaN(basis)) return null
  const diff = strike - basis
  if (diff < 0) {
    return {
      type: 'below',
      message: `This strike is below your cost basis — you would lock in a loss of $${Math.abs(diff).toFixed(2)}/share if called away`
    }
  }
  if (diff === 0) {
    return {
      type: 'at',
      message: 'This strike is at your cost basis — you would break even if called away'
    }
  }
  return {
    type: 'above',
    message: `Shares called away at $${strike.toFixed(2)} → profit of $${diff.toFixed(2)}/share`
  }
}
