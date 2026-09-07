type LiveBrokerConfirmDialogProps = {
  isOpen: boolean
  openPositionCount: number
  onCancel: () => void
  onConfirm: () => void
}

export function LiveBrokerConfirmDialog(
  props: LiveBrokerConfirmDialogProps
): React.JSX.Element | null {
  if (!props.isOpen) {
    return null
  }

  const bullets = [
    'Header changes from amber PAPER to green LIVE',
    'Buying power, cash, activities — all switch to your live account',
    'Positions in Wheelbase are not synchronized — your journal entries remain exactly as you recorded them',
    'Phase 4 order execution will route to live when enabled'
  ]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-broker-confirm-title"
        className="w-full max-w-[540px] rounded-xl border border-wb-border bg-wb-bg-surface p-6 text-wb-text-primary shadow-sheet"
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="h-[10px] w-[10px] rounded-full bg-wb-green" />
          <h2 id="live-broker-confirm-title" className="m-0 font-wb-mono text-[0.95rem] font-bold">
            Switch to LIVE Alpaca account?
          </h2>
        </div>

        <p className="m-0 font-wb-mono text-[0.78rem] leading-6 text-wb-text-secondary">
          From now on, Wheelbase will read buying power, cash, and broker activities from your{' '}
          <span className="font-semibold text-wb-text-primary">real money</span> Alpaca account.
          Activity polling switches to live; existing paper-account activities will no longer be
          checked.
        </p>

        <ul className="my-4 flex list-disc flex-col gap-2 pl-5 font-wb-mono text-[0.72rem] leading-6 text-wb-text-secondary">
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>

        {props.openPositionCount > 0 && (
          <div className="mb-4 rounded-md border border-wb-gold-border bg-wb-gold-dim px-4 py-3 font-wb-mono text-[0.72rem] leading-6 text-wb-gold">
            You have {props.openPositionCount} open positions in Wheelbase. Verify each one matches
            an actual contract in your live Alpaca account before acting on it.
          </div>
        )}

        <p className="m-0 font-wb-mono text-[0.7rem] leading-6 text-wb-text-muted">
          Market data reconnects with your live keys — same Alpaca feeds, same prices.
        </p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-md border border-wb-border px-4 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            className="rounded-md bg-wb-gold px-4 py-2 font-wb-mono text-xs font-semibold tracking-[0.06em] text-wb-bg-base"
          >
            Switch to LIVE
          </button>
        </div>
      </div>
    </div>
  )
}
