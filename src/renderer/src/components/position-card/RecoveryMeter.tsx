type RecoveryMeterProps = {
  /** The share of the LEAPS cost recovered, already clamped to [0, 1]. */
  fraction: number
  /** Gold once the credits have paid for the LEAPS. */
  gold: boolean
  title: string
}

/** The thin bar under Credits collected, filled to the premium recovered. */
export function RecoveryMeter({ fraction, gold, title }: RecoveryMeterProps): React.JSX.Element {
  const fill = String(Number((fraction * 100).toFixed(1)))
  return (
    <div title={title} className="mt-[7px] h-[3px] overflow-hidden rounded-[2px] bg-wb-border">
      <div
        data-testid="recovery-meter"
        data-fill={fill}
        className={`h-full ${gold ? 'bg-wb-gold' : 'bg-wb-green'}`}
        style={{ width: `${fill}%` }}
      />
    </div>
  )
}
