import { fmtQuoteTime } from '../lib/screener-format'

type PromoteProvenanceProps = {
  /** The instant the shown mark was quoted — the fresh quote's once it lands. */
  quotedAt: string
}

/**
 * [US-68] Says where the pre-filled values came from and how old they are. The form
 * feeds it the fresh quote's timestamp once the re-fetch succeeds, so the strip is
 * the trader's answer to "is this still current?".
 */
export function PromoteProvenance({ quotedAt }: PromoteProvenanceProps): React.JSX.Element {
  return (
    <div
      data-testid="promote-provenance"
      className="flex items-center gap-[10px] rounded-md border border-wb-gold-border bg-wb-gold-subtle px-3 py-2"
    >
      <span className="font-wb-mono text-[0.6rem] font-bold uppercase tracking-[0.08em] text-wb-gold">
        ⊞ Promoted from Screener
      </span>
      <span className="ml-auto font-wb-mono text-[0.68rem] text-wb-text-muted">
        Quoted {fmtQuoteTime(quotedAt)}
      </span>
    </div>
  )
}
