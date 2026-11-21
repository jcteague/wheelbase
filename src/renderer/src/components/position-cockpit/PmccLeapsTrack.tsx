// [US-109] The leg timeline's LEAPS track: the purchase, each LEAPS roll and any sale to close.
import { useId } from 'react'
import type {
  PmccLeapsRow,
  PmccLeapsTrack as LeapsTrack,
  PmccTimeline
} from '../../../../main/core/pmcc-timeline'
import { TOKEN_HEX } from '../../lib/phase'
import { leapsTrackHeader } from '../../lib/pmcc-timeline-display'
import {
  contractLabel,
  leapsBasisCell,
  leapsCoverageCell,
  leapsEventLabel,
  leapsRollPrices,
  rollContractLabel,
  rollNetCell,
  rowAmounts
} from '../../lib/pmcc-timeline-rows'
import { Badge } from '../ui/Badge'
import { TableCell, TableHeader } from '../ui/TablePrimitives'
import { NET_TONE } from './pmcc-timeline-tones'

export type PmccLeapsTrackProps = Pick<PmccTimeline, 'closedDate'> & { leapsTrack: LeapsTrack }

const COLUMNS = ['Event', 'Date', 'Contract', 'Price / share', 'Net', 'Coverage', 'Basis after']

const EVENT_BADGE: Record<PmccLeapsRow['kind'], string> = {
  PURCHASE: TOKEN_HEX.sky,
  ROLL: TOKEN_HEX.gold,
  CLOSE: TOKEN_HEX['text-muted'],
  UNKNOWN: TOKEN_HEX['text-muted']
}

const SECONDARY = 'text-wb-text-secondary'
const MUTED = 'text-wb-text-muted'

function LeapsRowCells({ row }: { row: PmccLeapsRow }): React.JSX.Element {
  switch (row.kind) {
    case 'PURCHASE':
    case 'CLOSE': {
      const amounts = rowAmounts(row)
      const inflow = row.kind === 'CLOSE'
      return (
        <>
          <TableCell className="text-wb-gold">{contractLabel(row.contract)}</TableCell>
          <TableCell className={inflow ? 'text-wb-green' : 'text-wb-red'}>
            {amounts.price}
          </TableCell>
          <TableCell className={SECONDARY}>{amounts.total}</TableCell>
          <TableCell className={SECONDARY}>
            {row.kind === 'PURCHASE' ? leapsCoverageCell(row) : 'closes coverage'}
          </TableCell>
        </>
      )
    }
    case 'ROLL':
      return (
        <>
          <TableCell className="text-wb-gold">{rollContractLabel(row)}</TableCell>
          <TableCell className={SECONDARY}>{leapsRollPrices(row)}</TableCell>
          <TableCell className={NET_TONE[row.net.direction]}>{rollNetCell(row)}</TableCell>
          <TableCell className={row.coverage.unbroken ? 'text-wb-green' : SECONDARY}>
            {leapsCoverageCell(row)}
          </TableCell>
        </>
      )
    case 'UNKNOWN':
      return (
        <TableCell colSpan={4} className={MUTED}>
          {''}
        </TableCell>
      )
  }
}

function LeapsRow({ row }: { row: PmccLeapsRow }): React.JSX.Element {
  const unknown = row.kind === 'UNKNOWN'
  return (
    <tr className="bg-wb-sky/5">
      <TableCell>
        {unknown ? (
          <span className={MUTED}>{leapsEventLabel(row)}</span>
        ) : (
          <Badge color={EVENT_BADGE[row.kind]}>{leapsEventLabel(row)}</Badge>
        )}
      </TableCell>
      <TableCell className={unknown ? MUTED : SECONDARY}>{row.date}</TableCell>
      <LeapsRowCells row={row} />
      <TableCell
        className={
          row.kind === 'PURCHASE' || row.kind === 'ROLL' ? 'font-semibold text-wb-sky' : MUTED
        }
      >
        {leapsBasisCell(row)}
      </TableCell>
    </tr>
  )
}

export function PmccLeapsTrack({ closedDate, leapsTrack }: PmccLeapsTrackProps): React.JSX.Element {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border border-wb-sky/30 bg-wb-sky/[0.03]"
    >
      <div className="flex items-baseline gap-2 border-b border-wb-sky/20 bg-wb-sky/10 px-5 py-2.5">
        <Badge color={TOKEN_HEX.sky}>L</Badge>
        <h3 id={headingId} className="font-wb-mono text-sm font-semibold text-wb-sky">
          LEAPS track
        </h3>
        <span className="font-wb-mono text-[0.65rem] text-wb-text-secondary">
          {leapsTrackHeader({ closedDate, leapsTrack })}
        </span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <TableHeader
                key={column}
                className={column === 'Basis after' ? 'text-wb-sky' : undefined}
              >
                {column}
              </TableHeader>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Rows are immutable and in timeline order; two can share a kind and a date. */}
          {leapsTrack.rows.map((row, index) => (
            <LeapsRow key={index} row={row} />
          ))}
        </tbody>
      </table>
    </section>
  )
}
