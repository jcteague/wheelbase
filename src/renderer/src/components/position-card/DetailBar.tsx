/**
 * The tier-2 toggle under the PMCC card's footer. Its click stops at the bar, so it opens tier 2
 * instead of reaching the card, whose click opens the position detail page.
 */
export function DetailBar({
  open,
  onToggle
}: {
  open: boolean
  onToggle: () => void
}): React.JSX.Element {
  function toggle(event: React.MouseEvent): void {
    event.stopPropagation()
    onToggle()
  }

  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={toggle}
      className={`flex w-full items-center justify-between gap-[10px] border-t border-wb-border px-[13px] py-[7px] text-left font-wb-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] transition-colors ${open ? 'text-wb-gold' : 'text-wb-text-muted hover:bg-wb-bg-elevated hover:text-wb-text-secondary'}`}
    >
      <span>{open ? 'Hide detail' : 'Detail · breakeven · max if called · Δ · extrinsic'}</span>
      <span
        aria-hidden="true"
        className={`inline-block text-[11px] transition-transform ${open ? 'rotate-180' : ''}`}
      >
        ▾
      </span>
    </button>
  )
}
