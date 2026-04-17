import React from 'react'
import { fmtMoney, pnlColor } from '../lib/format'
import { LEG_ROLE_LABEL, ROLE_COLOR } from '../lib/phase'
import { rollCreditDebitColors } from '../lib/rolls'
import {
  buildRollTimeline,
  CumulativeRollSummary,
  LegHistoryEntry,
  RollGroup
} from '../lib/rollGroups'
import { Badge } from './ui/Badge'
import { TableCell, TableHeader } from './ui/TablePrimitives'

type LegHistoryTableProps = {
  legs: LegHistoryEntry[]
  finalPnl?: string | null
}

const ROLL_CREDIT_BG = 'rgba(63,185,80,0.04)'
const ROLL_LEG_BG = 'rgba(88,166,255,0.02)'
const CUMULATIVE_BG = 'rgba(88,166,255,0.03)'

const assignmentAnnotationByRole = {
  ASSIGN: 'shares received',
  CALLED_AWAY: 'shares called away'
} as const

function formatDollarAmount(value: string): string {
  return parseFloat(value).toFixed(2)
}

function premiumContent(leg: LegHistoryEntry): React.JSX.Element {
  const assignmentAnnotation =
    assignmentAnnotationByRole[leg.legRole as keyof typeof assignmentAnnotationByRole]

  if (assignmentAnnotation) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-wb-text-secondary italic">— (assigned)</span>
        <span className="text-wb-text-secondary italic text-[0.68rem]">
          {leg.contracts * 100} {assignmentAnnotation}
        </span>
      </div>
    )
  }

  if (leg.legRole === 'CC_EXPIRED') {
    return <span className="text-wb-text-secondary italic">expired worthless</span>
  }

  if (leg.premiumPerContract == null) {
    return <span className="text-wb-text-secondary italic">—</span>
  }

  const amount = formatDollarAmount(leg.premiumPerContract)

  if (leg.legRole === 'CC_CLOSE') {
    return <span className="text-wb-gold whitespace-nowrap">−${amount}</span>
  }

  if (leg.legRole === 'ROLL_FROM') {
    // ROLL_FROM is buy-to-close — cost out, not a credit. Show in red with a leading minus.
    return <span className="text-wb-red whitespace-nowrap">−${amount}</span>
  }

  if (parseFloat(leg.premiumPerContract) !== 0) {
    return <span className="text-wb-green whitespace-nowrap">+${amount}</span>
  }

  return <span className="text-wb-text-secondary italic">—</span>
}

function PremiumCell({ leg }: { leg: LegHistoryEntry }): React.JSX.Element {
  return <td className="whitespace-nowrap px-3 py-2">{premiumContent(leg)}</td>
}

function BasisCell({ value }: { value: string | null }): React.JSX.Element {
  return (
    <td className="px-3 py-2 bg-[rgba(121,192,255,0.05)] border-l border-[rgba(121,192,255,0.12)]">
      {value == null ? (
        <span className="text-wb-text-secondary">—</span>
      ) : (
        <span className="text-[#79c0ff] font-semibold">${formatDollarAmount(value)}</span>
      )}
    </td>
  )
}

function LegRow({
  leg,
  isRoll = false
}: {
  leg: LegHistoryEntry
  isRoll?: boolean
}): React.JSX.Element {
  return (
    <tr
      className="border-b border-wb-border"
      style={isRoll ? { background: ROLL_LEG_BG } : undefined}
    >
      <TableCell className={isRoll ? 'pl-7' : undefined}>
        <Badge color={ROLE_COLOR[leg.legRole] ?? '#8899aa'}>
          {LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-wb-text-secondary whitespace-nowrap">{leg.action}</span>
      </TableCell>
      <TableCell>
        <span className="text-wb-gold whitespace-nowrap">${formatDollarAmount(leg.strike)}</span>
      </TableCell>
      <TableCell>
        <span className="text-wb-text-secondary">{leg.expiration ?? '—'}</span>
      </TableCell>
      <TableCell>
        <span className="text-wb-text-secondary">{leg.contracts}</span>
      </TableCell>
      <PremiumCell leg={leg} />
      <TableCell>{leg.fillDate}</TableCell>
      <BasisCell value={leg.runningCostBasis} />
    </tr>
  )
}

function formatNetDisplay(net: RollGroup['net']): { label: string; amount: string } {
  const sign = net.isCredit ? '+' : '−'
  const perContract = net.perContract.toFixed(2)
  const total = net.total.toFixed(2)
  return {
    label: net.isCredit ? 'Net Credit' : 'Net Debit',
    amount: `${sign}$${perContract}/contract ($${total} total)`
  }
}

function RollGroupHeaderRow({ group }: { group: RollGroup }): React.JSX.Element {
  const colors = rollCreditDebitColors(group.net.isCredit)
  const { label: netLabel, amount: netDisplay } = formatNetDisplay(group.net)
  return (
    <tr
      className={`border-b border-wb-border ${group.net.isCredit ? '' : 'bg-wb-gold-subtle'}`}
      style={{
        borderTop: `2px solid ${colors.border}`,
        background: group.net.isCredit ? ROLL_CREDIT_BG : undefined
      }}
    >
      <td colSpan={8} className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: colors.color }}>
              Roll #{group.rollNumber}
            </span>
            <Badge color={colors.color}>{group.rollType}</Badge>
            {group.rollDetail && (
              <span className="text-xs text-wb-text-secondary">{group.rollDetail}</span>
            )}
            <span className="text-xs text-wb-text-secondary">{group.fillDate}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold" style={{ color: colors.color }}>
              {netLabel}
            </span>
            <span className="text-sm font-bold font-mono" style={{ color: colors.color }}>
              {netDisplay}
            </span>
          </div>
        </div>
      </td>
    </tr>
  )
}

function CumulativeSummaryRow({ summary }: { summary: CumulativeRollSummary }): React.JSX.Element {
  const rollLabel = summary.rollCount === 1 ? '1 roll' : `${summary.rollCount} rolls`
  const netColor = summary.net >= 0 ? 'var(--wb-green)' : 'var(--wb-red)'
  const netSign = summary.net >= 0 ? '+' : '−'

  return (
    <tr style={{ background: CUMULATIVE_BG }}>
      <td
        colSpan={8}
        className="px-3 py-2 border-b border-wb-border"
        style={{ borderTop: '1px solid var(--wb-blue-dim)' }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-wb-text-secondary">Roll Summary ({rollLabel})</span>
          <div className="flex items-center gap-4">
            <span className="text-xs text-wb-green">
              Credits: +${summary.totalCredits.toFixed(2)}
            </span>
            {summary.totalDebits > 0 && (
              <span className="text-xs text-wb-gold">
                Debits: −${summary.totalDebits.toFixed(2)}
              </span>
            )}
            <span className="text-xs font-bold" style={{ color: netColor }}>
              Net: {netSign}${Math.abs(summary.net).toFixed(2)}
            </span>
          </div>
        </div>
      </td>
    </tr>
  )
}

export function LegHistoryTable({ legs, finalPnl }: LegHistoryTableProps): React.JSX.Element {
  const timeline = buildRollTimeline(legs)

  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <TableHeader>Role</TableHeader>
          <TableHeader>Action</TableHeader>
          <TableHeader>Strike</TableHeader>
          <TableHeader>Expiration</TableHeader>
          <TableHeader>Contracts</TableHeader>
          <TableHeader>Premium</TableHeader>
          <TableHeader>Fill Date</TableHeader>
          <TableHeader className="bg-[rgba(121,192,255,0.05)] border-l border-[rgba(121,192,255,0.12)] text-[#79c0ff]">
            Running Basis / Share
          </TableHeader>
        </tr>
      </thead>
      <tbody>
        {timeline.map((item) => {
          if (item.type === 'leg') {
            return <LegRow key={item.leg.id} leg={item.leg} />
          }
          if (item.type === 'roll') {
            return (
              <React.Fragment key={item.rollChainId}>
                <RollGroupHeaderRow group={item} />
                <LegRow leg={item.rollFromLeg} isRoll />
                <LegRow leg={item.rollToLeg} isRoll />
              </React.Fragment>
            )
          }
          return <CumulativeSummaryRow key="cumulative" summary={item.summary} />
        })}
      </tbody>
      {finalPnl ? (
        <tfoot>
          <tr>
            <td
              colSpan={8}
              className="px-3 py-2.5 border-t border-[rgba(63,185,80,0.3)] bg-[rgba(63,185,80,0.04)] whitespace-nowrap"
            >
              <span className="text-wb-text-secondary mr-2">Final P&L</span>
              <span className="font-semibold" style={{ color: pnlColor(finalPnl) }}>
                {fmtMoney(finalPnl)}
              </span>
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}
