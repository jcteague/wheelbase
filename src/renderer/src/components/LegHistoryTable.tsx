import { fmtMoney, pnlColor } from '../lib/format'
import { LEG_ROLE_LABEL, ROLE_COLOR } from '../lib/phase'
import { Badge } from './ui/Badge'
import { TableCell, TableHeader } from './ui/TablePrimitives'

type LegHistoryEntry = {
  id: string
  positionId: string
  legRole: string
  action: string
  instrumentType: string
  strike: string
  expiration: string | null
  contracts: number
  premiumPerContract: string | null
  fillDate: string
  runningCostBasis: string | null
}

type LegHistoryTableProps = {
  legs: LegHistoryEntry[]
  finalPnl?: string | null
}

const assignmentAnnotationByRole = {
  ASSIGN: 'shares received',
  CALLED_AWAY: 'shares called away'
} as const

function formatDollarAmount(value: string): string {
  return parseFloat(value).toFixed(2)
}

function renderAssignedPremiumCell(annotation: string, contracts: number): React.JSX.Element {
  return (
    <td className="whitespace-nowrap px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-wb-text-secondary italic">— (assigned)</span>
        <span className="text-wb-text-secondary italic text-[0.68rem]">
          {contracts * 100} {annotation}
        </span>
      </div>
    </td>
  )
}

function PremiumCell({ leg }: { leg: LegHistoryEntry }): React.JSX.Element {
  const assignmentAnnotation =
    assignmentAnnotationByRole[leg.legRole as keyof typeof assignmentAnnotationByRole]

  if (assignmentAnnotation) {
    return renderAssignedPremiumCell(assignmentAnnotation, leg.contracts)
  }

  if (leg.legRole === 'CC_EXPIRED') {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <span className="text-wb-text-secondary italic">expired worthless</span>
      </td>
    )
  }

  if (leg.premiumPerContract == null) {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <span className="text-wb-text-secondary italic">—</span>
      </td>
    )
  }

  const amount = formatDollarAmount(leg.premiumPerContract)

  if (leg.legRole === 'CC_CLOSE') {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <span className="text-wb-gold whitespace-nowrap">−${amount}</span>
      </td>
    )
  }

  if (parseFloat(leg.premiumPerContract) !== 0) {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <span className="text-wb-green whitespace-nowrap">+${amount}</span>
      </td>
    )
  }

  return (
    <td className="whitespace-nowrap px-3 py-2">
      <span className="text-wb-text-secondary italic">—</span>
    </td>
  )
}

function BasisCell({ value }: { value: string | null }): React.JSX.Element {
  if (value == null) {
    return (
      <td className="px-3 py-2 bg-[rgba(121,192,255,0.05)] border-l border-[rgba(121,192,255,0.12)]">
        <span className="text-wb-text-secondary">—</span>
      </td>
    )
  }

  return (
    <td className="px-3 py-2 bg-[rgba(121,192,255,0.05)] border-l border-[rgba(121,192,255,0.12)]">
      <span className="text-[#79c0ff] font-semibold">${formatDollarAmount(value)}</span>
    </td>
  )
}

export function LegHistoryTable({ legs, finalPnl }: LegHistoryTableProps): React.JSX.Element {
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
        {legs.map((leg) => (
          <tr key={leg.id} className="border-b border-wb-border">
            <TableCell>
              <Badge color={ROLE_COLOR[leg.legRole] ?? '#8899aa'}>
                {LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole}
              </Badge>
            </TableCell>
            <TableCell>
              <span className="text-wb-text-secondary whitespace-nowrap">{leg.action}</span>
            </TableCell>
            <TableCell>
              <span className="text-wb-gold whitespace-nowrap">
                ${formatDollarAmount(leg.strike)}
              </span>
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
        ))}
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
