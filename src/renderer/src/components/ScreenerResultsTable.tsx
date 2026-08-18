import type { ScreenerCandidate } from '../api/screener'
import { fmtDate, fmtMoney } from '../lib/format'
import {
  fmtDelta,
  fmtIvr,
  fmtOpenInterest,
  fmtScore,
  fmtSpread,
  fmtYieldPercent
} from '../lib/screener-format'
import { EarningsBadge } from './EarningsBadge'
import { TableCell, TableHeader } from './ui/TablePrimitives'

type ScreenerResultsTableProps = {
  candidates: ScreenerCandidate[]
  /** [US-68] Raised with the clicked row's candidate. The page owns the navigation. */
  onPromote: (candidate: ScreenerCandidate) => void
}

const NUMERIC = 'text-right'
const SECONDARY = `${NUMERIC} text-wb-text-secondary`
const MUTED = `${NUMERIC} text-wb-text-muted`
const YIELD = `${NUMERIC} text-wb-green font-medium`
const ANNUALIZED_YIELD = `${NUMERIC} text-wb-green font-semibold`
const RANK_PILL =
  'inline-flex items-center justify-center w-5 h-5 rounded-[5px] bg-wb-gold-dim text-wb-gold text-[0.68rem] font-bold'
const DEMOTED_RANK = 'font-wb-mono text-[0.72rem] text-wb-text-muted'

export function ScreenerResultsTable({
  candidates,
  onPromote
}: ScreenerResultsTableProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="border border-wb-border rounded-md bg-wb-bg-surface overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <TableHeader>#</TableHeader>
              <TableHeader>Ticker</TableHeader>
              <TableHeader className={NUMERIC}>Strike</TableHeader>
              <TableHeader className={NUMERIC}>Exp</TableHeader>
              <TableHeader className={NUMERIC}>DTE</TableHeader>
              <TableHeader className={NUMERIC}>Mark</TableHeader>
              <TableHeader className={NUMERIC}>Yield</TableHeader>
              <TableHeader className={NUMERIC}>Ann.</TableHeader>
              <TableHeader className={NUMERIC}>Δ</TableHeader>
              <TableHeader className={NUMERIC}>IVR</TableHeader>
              <TableHeader className={NUMERIC}>OI</TableHeader>
              <TableHeader className={NUMERIC}>Spread</TableHeader>
              {/* [US-68] The promote action's column — unlabelled, and last so the
                  metric columns keep the positions US-66 pinned. */}
              <TableHeader />
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => (
              <CandidateRow
                key={candidate.contractId}
                candidate={candidate}
                rank={index + 1}
                onPromote={onPromote}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-wb-mono text-xs text-wb-text-muted leading-relaxed">
        Ranked by yield-per-delta — annualized return-if-flat ÷ delta
      </p>
    </div>
  )
}

type CandidateRowProps = {
  candidate: ScreenerCandidate
  rank: number
  onPromote: (candidate: ScreenerCandidate) => void
}

type RankCellProps = {
  rank: number
  /** Yield-per-delta, shown as the tooltip on both treatments. */
  score: string
  /** [US-70] True when the candidate's earnings verdict is anything but `clear`. */
  demoted: boolean
}

/** [US-70] A demoted candidate gives up its rank number — the number would claim a
 *  standing among the clean candidates that its earnings tier explicitly denies it —
 *  and shows an em dash in the muted treatment instead. The score stays reachable
 *  through the same tooltip either way, so nothing is lost with the pill. */
function RankCell({ rank, score, demoted }: RankCellProps): React.JSX.Element {
  return (
    <TableCell>
      <span title={score} className={demoted ? DEMOTED_RANK : RANK_PILL}>
        {demoted ? '—' : rank}
      </span>
    </TableCell>
  )
}

function CandidateRow({ candidate, rank, onPromote }: CandidateRowProps): React.JSX.Element {
  const score = fmtScore(candidate.yieldPerDelta)

  return (
    <tr data-testid={`screener-row-${candidate.ticker}`} data-yield-per-delta={score}>
      <RankCell rank={rank} score={score} demoted={candidate.earnings.status !== 'clear'} />
      <TableCell>
        <div className="flex flex-col gap-1">
          <span className="font-bold text-wb-gold tracking-wide">{candidate.ticker}</span>
          <EarningsBadge earnings={candidate.earnings} />
        </div>
      </TableCell>
      <TableCell className={NUMERIC}>{fmtMoney(candidate.strike)}</TableCell>
      <TableCell className={SECONDARY}>{fmtDate(candidate.expiration)}</TableCell>
      <TableCell className={SECONDARY}>{candidate.dte}d</TableCell>
      <TableCell className={NUMERIC}>{fmtMoney(candidate.mark)}</TableCell>
      <TableCell className={YIELD}>{fmtYieldPercent(candidate.periodYield)}</TableCell>
      <TableCell className={ANNUALIZED_YIELD}>
        {fmtYieldPercent(candidate.annualizedYield)}/yr
      </TableCell>
      <TableCell className={NUMERIC}>{fmtDelta(candidate.delta)}</TableCell>
      <TableCell className={candidate.ivRank === null ? MUTED : NUMERIC}>
        {fmtIvr(candidate.ivRank)}
      </TableCell>
      <TableCell className={SECONDARY}>{fmtOpenInterest(candidate.openInterest)}</TableCell>
      <TableCell className={SECONDARY}>
        {fmtSpread(candidate.spreadAbsolute, candidate.spreadPercent)}
      </TableCell>
      <TableCell className={NUMERIC}>
        <button
          type="button"
          aria-label="Promote to trade"
          data-testid={`screener-promote-${candidate.ticker}`}
          onClick={() => onPromote(candidate)}
          className="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-wb-gold-border bg-wb-gold-dim px-[9px] py-[3px] font-wb-mono text-[0.65rem] font-semibold tracking-[0.04em] text-wb-gold"
        >
          Promote →
        </button>
      </TableCell>
    </tr>
  )
}
