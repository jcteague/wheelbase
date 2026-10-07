// [US-104] The roll's net: a dashed placeholder until both cash fields parse, then the net debit
// or credit, the roll's label and the post-roll cost basis and effective share cost.
import { fmtMoney } from '../lib/format'
import type { PmccPostRoll, PmccRollNet } from '../lib/pmcc-roll'
import { SectionCard } from './ui/SectionCard'
import { SummaryRow } from './ui/SummaryRow'

type PmccRollNetPreviewProps = {
  net: PmccRollNet
  postRoll: PmccPostRoll | null
  /** `null` until the roll is valid. */
  label: string | null
  replacementDte: number | null
  basisPerShare: string
  effectiveShareCost: string
}

export function PmccRollNetPreview({
  net,
  postRoll,
  label,
  replacementDte,
  basisPerShare,
  effectiveShareCost
}: PmccRollNetPreviewProps): React.JSX.Element {
  if (net === null || postRoll === null) {
    return (
      <div className="rounded border border-dashed border-wb-border p-4 text-center text-xs text-wb-text-muted">
        Enter a cost to close and a premium to preview the net.
      </div>
    )
  }
  const isDebit = net.net.isNegative()
  return (
    <SectionCard header="Net" headerVariant="emphasized">
      <div className="flex flex-col gap-1.5 p-4">
        <div data-testid="pmcc-roll-net" className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-widest text-wb-text-muted">
            {isDebit ? 'Net Debit' : 'Net Credit'}:
          </span>{' '}
          <span
            data-testid="pmcc-roll-net-amount"
            className={`text-xl font-semibold ${isDebit ? 'text-wb-red' : 'text-wb-green'}`}
          >
            ${net.perShare}{' '}
            <span className="text-xs font-normal text-wb-text-muted">
              per share (${net.total} total)
            </span>
          </span>
        </div>
        {label ? (
          <div
            data-testid="pmcc-roll-label"
            className="rounded bg-wb-bg-elevated px-3 py-2 text-[11px] text-wb-text-secondary"
          >
            {label}
            {replacementDte === null ? '' : ` · ${replacementDte} DTE`}
          </div>
        ) : null}
        <SummaryRow
          label="Cost basis after roll"
          value={`${fmtMoney(postRoll.postBasis)} / share (from ${fmtMoney(basisPerShare)})`}
          highlight
        />
        <SummaryRow
          label="Effective share cost after roll"
          value={`${fmtMoney(postRoll.effectiveAfter)} (from ${fmtMoney(effectiveShareCost)})`}
        />
      </div>
    </SectionCard>
  )
}
