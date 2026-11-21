// [US-109] One short-call cycle: its header and net, any coverage flag, its rows (rolls stay
// inside) and the running basis after it.
import { useId } from 'react'
import type { PmccCycle, PmccCycleRow } from '../../../../main/core/pmcc-timeline'
import { TOKEN_HEX } from '../../lib/phase'
import {
  basisFooter,
  coverageFlag,
  cycleHeader,
  cycleNetLabel,
  rollMarker,
  signedPerShareAndTotal
} from '../../lib/pmcc-timeline-display'
import {
  contractLabel,
  cycleEventLabel,
  cycleOutcome,
  cycleTitle,
  type CycleOutcome,
  openCycleRow,
  outcomeLabel,
  rollContractLabel,
  rollNetCell,
  rowAmounts,
  shortRollPrices,
  unrecordedCycleRow
} from '../../lib/pmcc-timeline-rows'
import { Badge } from '../ui/Badge'
import { TableCell } from '../ui/TablePrimitives'
import { NET_TONE, OUTCOME_TONE, signedNetTone } from './pmcc-timeline-tones'

export type PmccCycleGroupProps = { cycle: PmccCycle }

const SECONDARY = 'text-wb-text-secondary'
const MUTED = 'text-wb-text-muted'

function OutcomeBadge({ outcome }: { outcome: CycleOutcome }): React.JSX.Element {
  const tone = OUTCOME_TONE[outcome]
  return (
    <Badge color={tone.badge} className={tone.text}>
      {outcomeLabel(outcome)}
    </Badge>
  )
}

function CycleRow({ row }: { row: PmccCycleRow }): React.JSX.Element {
  switch (row.kind) {
    case 'OPEN': {
      const amounts = rowAmounts(row)
      return (
        <tr>
          <TableCell className="w-[130px]">
            <Badge color={TOKEN_HEX.violet}>{cycleEventLabel(row)}</Badge>
          </TableCell>
          <TableCell className={`w-[100px] ${SECONDARY}`}>{row.date}</TableCell>
          <TableCell className="text-wb-gold">{contractLabel(row.contract)}</TableCell>
          <TableCell className="text-wb-green">{amounts.price}</TableCell>
          <TableCell className={SECONDARY}>{amounts.total}</TableCell>
        </tr>
      )
    }
    case 'ROLL':
      return (
        <tr className="bg-wb-blue/[0.03]">
          <TableCell className="pl-7">
            <Badge color={row.net.direction === 'debit' ? TOKEN_HEX.gold : TOKEN_HEX.green}>
              {cycleEventLabel(row)}
            </Badge>
          </TableCell>
          <TableCell className={SECONDARY}>{row.date}</TableCell>
          <TableCell className="text-wb-gold">{rollContractLabel(row)}</TableCell>
          <TableCell className={SECONDARY}>{shortRollPrices(row)}</TableCell>
          <TableCell className={NET_TONE[row.net.direction]}>{rollNetCell(row)}</TableCell>
        </tr>
      )
    case 'UNKNOWN':
      return (
        <tr>
          <TableCell className="pl-7">
            <span className={MUTED}>{cycleEventLabel(row)}</span>
          </TableCell>
          <TableCell className={MUTED}>{row.date}</TableCell>
          <TableCell colSpan={3} className={MUTED}>
            {''}
          </TableCell>
        </tr>
      )
    case 'END': {
      const amounts = rowAmounts(row)
      return (
        <tr>
          <TableCell>
            <OutcomeBadge outcome={row.outcome} />
          </TableCell>
          <TableCell className={SECONDARY}>{row.date}</TableCell>
          <TableCell className="text-wb-gold">{contractLabel(row.contract)}</TableCell>
          <TableCell className={`${SECONDARY} italic`}>{amounts.price}</TableCell>
          <TableCell className={`${SECONDARY} italic`}>{amounts.total}</TableCell>
        </tr>
      )
    }
  }
}

/** The last row of a cycle with no terminal event: its DTE left, or its unrecorded expiration. */
function StatusRow({ cycle }: PmccCycleGroupProps): React.JSX.Element | null {
  if (cycle.status === 'ENDED') return null
  return (
    <tr>
      <TableCell>
        <OutcomeBadge outcome={cycle.status} />
      </TableCell>
      <TableCell className={SECONDARY}>—</TableCell>
      <TableCell colSpan={3} className={SECONDARY}>
        {cycle.status === 'OPEN' ? openCycleRow(cycle) : unrecordedCycleRow(cycle)}
      </TableCell>
    </tr>
  )
}

export function PmccCycleGroup({ cycle }: PmccCycleGroupProps): React.JSX.Element {
  const headingId = useId()
  const outcome = cycleOutcome(cycle)
  const rolls = rollMarker(cycle.rollCount)
  const footer = basisFooter(cycle)

  return (
    <section aria-labelledby={headingId} className="border-b border-wb-border">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 ${
          cycle.status === 'OPEN' ? 'bg-wb-gold/5' : 'bg-wb-blue/[0.02]'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={TOKEN_HEX.violet}>S</Badge>
          <h4 id={headingId} className="font-wb-mono text-sm font-bold text-wb-text-primary">
            {cycleTitle(cycle.number)}
          </h4>
          <span className={`font-wb-mono text-[0.7rem] ${SECONDARY}`}>{cycleHeader(cycle)}</span>
          <OutcomeBadge outcome={outcome} />
          {rolls && <Badge color={TOKEN_HEX.gold}>{rolls}</Badge>}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={`font-wb-mono text-[0.65rem] uppercase tracking-[0.08em] ${MUTED}`}>
            {cycleNetLabel(cycle)}
          </span>
          <span className={`font-wb-mono text-sm font-bold ${signedNetTone(cycle.netPerShare)}`}>
            {signedPerShareAndTotal(cycle.netPerShare, cycle.netTotal)}
          </span>
        </div>
      </div>

      {cycle.flag && (
        <p className="border-b border-wb-red/30 bg-wb-red-dim px-5 py-2 font-wb-mono text-[0.7rem] text-wb-red">
          <span aria-hidden="true">⚠ </span>
          <span>{coverageFlag(cycle.flag)}</span>{' '}
          <span>US-102 rejects new legs in this shape; this one predates it.</span>
        </p>
      )}

      <table className="w-full border-collapse">
        <tbody>
          {/* Rows are immutable and in timeline order; two can share a kind and a date. */}
          {cycle.rows.map((row, index) => (
            <CycleRow key={index} row={row} />
          ))}
          <StatusRow cycle={cycle} />
        </tbody>
      </table>

      <div className="border-t border-wb-border bg-wb-sky/5 px-5 py-1.5 font-wb-mono">
        <span className={`text-[0.65rem] ${MUTED}`}>{footer.label}</span>
        <span className="ml-2 text-[0.75rem] font-semibold text-wb-sky">{footer.value}</span>
        <span className={`ml-2 text-[0.65rem] ${MUTED}`}>from the US-103 ledger</span>
      </div>
    </section>
  )
}
