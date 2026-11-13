// [US-96] The page-level notices around the bench: the guidance shown before any ticker is
// saved, and the confirmation of a criteria save.

/** Shown in place of the bench while nothing is on the watchlist. */
export function EmptyGuidance(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[10px] border border-dashed border-wb-gold-border bg-wb-bg-surface px-8 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-wb-gold-border bg-wb-gold-dim text-xl text-wb-gold">
        ☰
      </div>
      <div className="text-base font-semibold text-wb-text-primary">No tickers yet</div>
      <div className="max-w-[420px] text-sm leading-relaxed text-wb-text-secondary">
        Add tickers you&rsquo;d consider selling puts on, with the conditions you&rsquo;re waiting
        for. The screener pulls option chains for every name and ranks the best entries.
      </div>
    </div>
  )
}

/** Confirms a save on the page itself — the sheet closes, so it cannot confirm its own success. */
export function SavedBanner(): React.JSX.Element {
  return (
    <div className="flex items-center gap-[10px] rounded-md border border-wb-green-border bg-wb-green-subtle px-[14px] py-[10px]">
      <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-wb-green-dim font-wb-mono text-[0.7rem] font-bold text-wb-green">
        ✓
      </span>
      <span className="text-[0.8125rem] font-semibold text-wb-green">Screening criteria saved</span>
    </div>
  )
}
