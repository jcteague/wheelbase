import Decimal from 'decimal.js'

type CcPnlPreviewProps = {
  openPremiumPerContract: string
  closePricePerContract: string
  contracts: number
}

export function CcPnlPreview({
  openPremiumPerContract,
  closePricePerContract,
  contracts
}: CcPnlPreviewProps): React.JSX.Element | null {
  if (!closePricePerContract || closePricePerContract === '0') return null

  let closeDecimal: Decimal
  try {
    closeDecimal = new Decimal(closePricePerContract)
    if (closeDecimal.lte(0)) return null
  } catch {
    return null
  }

  const open = new Decimal(openPremiumPerContract)
  const pnl = open.minus(closeDecimal).times(contracts).times(100)
  const pnlAbs = pnl.abs()
  const pnlFormatted = pnlAbs.toFixed(2)

  let label: string
  let color: string

  if (pnl.gt(0)) {
    // Profit: % of max profit captured = (openPremium − closePrice) / openPremium × 100
    const pct = open
      .minus(closeDecimal)
      .div(open)
      .times(100)
      .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    label = `+$${pnlFormatted} profit · ${pct}% of max`
    color = 'var(--wb-green, #22c55e)'
  } else if (pnl.lt(0)) {
    // Loss: (closePrice - openPremium) / openPremium × 100 = % above open
    const pct = closeDecimal
      .minus(open)
      .div(open)
      .times(100)
      .toDecimalPlaces(1, Decimal.ROUND_HALF_UP)
    label = `\u2212$${pnlFormatted} loss · ${pct}% above open`
    color = 'var(--wb-red, #ef4444)'
  } else {
    label = `$0.00 break-even`
    color = 'var(--wb-muted, #6b7280)'
  }

  return (
    <div style={{ color, fontSize: '0.85rem', fontWeight: 500, padding: '4px 0' }}>{label}</div>
  )
}
