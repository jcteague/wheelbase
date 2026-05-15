import type { Pnl } from '../../lib/verdict'

type PnlBarProps = { pnl: Pnl }

function fillColorFor(pct: number): string {
  if (pct >= 25) return 'var(--wb-green)'
  if (pct >= 0) return 'var(--wb-gold)'
  return 'var(--wb-red)'
}

export function PnlBar({ pnl }: PnlBarProps): React.JSX.Element {
  const pct = Math.max(-20, Math.min(120, pnl.pct))
  const fillWidth = `${Math.max(0, pct)}%`
  const color = fillColorFor(pnl.pct)

  return (
    <div
      className="relative h-2.5 rounded overflow-hidden border border-wb-border bg-wb-bg-base"
      role="progressbar"
      aria-valuenow={Math.max(0, Math.round(pct))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="opacity-85 absolute inset-0 transition-[width] duration-400 ease-in-out"
        style={{ width: fillWidth, background: color }}
      />
      <div
        className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px opacity-50 bg-wb-text-primary"
        aria-hidden
      />
    </div>
  )
}
