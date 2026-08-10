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
import { TableCell, TableHeader } from './ui/TablePrimitives'

type ScreenerResultsTableProps = {
  candidates: ScreenerCandidate[]
}

const NUMERIC = 'text-right'
const SECONDARY = `${NUMERIC} text-wb-text-secondary`
const MUTED = `${NUMERIC} text-wb-text-muted`
const YIELD = `${NUMERIC} text-wb-green font-medium`
const ANNUALIZED_YIELD = `${NUMERIC} text-wb-green font-semibold`

export function ScreenerResultsTable({ candidates }: ScreenerResultsTableProps): React.JSX.Element {
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
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate, index) => (
              <CandidateRow key={candidate.contractId} candidate={candidate} rank={index + 1} />
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
}

function CandidateRow({ candidate, rank }: CandidateRowProps): React.JSX.Element {
  const score = fmtScore(candidate.yieldPerDelta)

  return (
    <tr data-testid={`screener-row-${candidate.ticker}`} data-yield-per-delta={score}>
      <TableCell>
        <span
          title={score}
          className="inline-flex items-center justify-center w-5 h-5 rounded-[5px] bg-wb-gold-dim text-wb-gold text-[0.68rem] font-bold"
        >
          {rank}
        </span>
      </TableCell>
      <TableCell>
        <span className="font-bold text-wb-gold tracking-wide">{candidate.ticker}</span>
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
    </tr>
  )
}
