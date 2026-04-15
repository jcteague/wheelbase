export type GuardrailComparison = {
  type: 'below' | 'at' | 'above'
  diffPerShare: number
}

export function computeGuardrailComparison(
  strikeStr: string,
  basisStr: string
): GuardrailComparison | null {
  const strike = parseFloat(strikeStr)
  const basis = parseFloat(basisStr)
  if (isNaN(strike) || isNaN(basis)) return null
  const diff = strike - basis
  if (diff < 0) return { type: 'below', diffPerShare: diff }
  if (diff === 0) return { type: 'at', diffPerShare: 0 }
  return { type: 'above', diffPerShare: diff }
}

export type GuardrailResult =
  | { type: 'below' | 'at'; message: string }
  | { type: 'above'; message: string }
  | null

export function computeGuardrail(strikeStr: string, basisStr: string): GuardrailResult {
  const comparison = computeGuardrailComparison(strikeStr, basisStr)
  if (!comparison) return null
  const { type, diffPerShare } = comparison
  const strike = parseFloat(strikeStr)
  if (type === 'below') {
    return {
      type: 'below',
      message: `This strike is below your cost basis — you would lock in a loss of $${Math.abs(diffPerShare).toFixed(2)}/share if called away`
    }
  }
  if (type === 'at') {
    return {
      type: 'at',
      message: 'This strike is at your cost basis — you would break even if called away'
    }
  }
  return {
    type: 'above',
    message: `Shares called away at $${strike.toFixed(2)} → profit of $${diffPerShare.toFixed(2)}/share`
  }
}
