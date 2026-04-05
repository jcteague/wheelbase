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

const cellStyle: React.CSSProperties = { whiteSpace: 'nowrap', padding: '8px 12px' }
const mutedCellTextStyle: React.CSSProperties = {
  color: 'var(--wb-text-secondary)',
  fontStyle: 'italic'
}
const runningBasisAccentStyle: React.CSSProperties = {
  background: 'rgba(121,192,255,0.05)',
  borderLeft: '1px solid rgba(121,192,255,0.12)'
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
    <td style={cellStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={mutedCellTextStyle}>— (assigned)</span>
        <span style={{ ...mutedCellTextStyle, fontSize: '0.68rem' }}>
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
      <td style={cellStyle}>
        <span style={mutedCellTextStyle}>expired worthless</span>
      </td>
    )
  }

  if (leg.premiumPerContract == null) {
    return (
      <td style={cellStyle}>
        <span style={mutedCellTextStyle}>—</span>
      </td>
    )
  }

  const amount = formatDollarAmount(leg.premiumPerContract)

  if (leg.legRole === 'CC_CLOSE') {
    return (
      <td style={cellStyle}>
        <span style={{ color: 'var(--wb-gold)', whiteSpace: 'nowrap' }}>−${amount}</span>
      </td>
    )
  }

  if (parseFloat(leg.premiumPerContract) !== 0) {
    return (
      <td style={cellStyle}>
        <span style={{ color: 'var(--wb-green)', whiteSpace: 'nowrap' }}>+${amount}</span>
      </td>
    )
  }

  return (
    <td style={cellStyle}>
      <span style={mutedCellTextStyle}>—</span>
    </td>
  )
}

function BasisCell({ value }: { value: string | null }): React.JSX.Element {
  const basisCellStyle = { ...cellStyle, ...runningBasisAccentStyle }

  if (value == null) {
    return (
      <td style={basisCellStyle}>
        <span style={{ color: 'var(--wb-text-secondary)' }}>—</span>
      </td>
    )
  }

  return (
    <td style={basisCellStyle}>
      <span style={{ color: '#79c0ff', fontWeight: 600 }}>${formatDollarAmount(value)}</span>
    </td>
  )
}

export function LegHistoryTable({ legs, finalPnl }: LegHistoryTableProps): React.JSX.Element {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <TableHeader>Role</TableHeader>
          <TableHeader>Action</TableHeader>
          <TableHeader>Strike</TableHeader>
          <TableHeader>Expiration</TableHeader>
          <TableHeader>Contracts</TableHeader>
          <TableHeader>Premium</TableHeader>
          <TableHeader>Fill Date</TableHeader>
          <TableHeader style={{ ...runningBasisAccentStyle, color: '#79c0ff' }}>
            Running Basis / Share
          </TableHeader>
        </tr>
      </thead>
      <tbody>
        {legs.map((leg) => (
          <tr key={leg.id}>
            <TableCell>
              <Badge color={ROLE_COLOR[leg.legRole] ?? '#8899aa'}>
                {LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole}
              </Badge>
            </TableCell>
            <TableCell>
              <span style={{ color: 'var(--wb-text-secondary)', whiteSpace: 'nowrap' }}>
                {leg.action}
              </span>
            </TableCell>
            <TableCell>
              <span style={{ color: 'var(--wb-gold)', whiteSpace: 'nowrap' }}>
                ${formatDollarAmount(leg.strike)}
              </span>
            </TableCell>
            <TableCell>
              <span style={{ color: 'var(--wb-text-secondary)' }}>{leg.expiration ?? '—'}</span>
            </TableCell>
            <TableCell>
              <span style={{ color: 'var(--wb-text-secondary)' }}>{leg.contracts}</span>
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
              style={{
                padding: '10px 12px',
                borderTop: '1px solid rgba(63,185,80,0.3)',
                background: 'rgba(63,185,80,0.04)',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ color: 'var(--wb-text-secondary)', marginRight: 8 }}>Final P&L</span>
              <span style={{ color: pnlColor(finalPnl), fontWeight: 600 }}>
                {fmtMoney(finalPnl)}
              </span>
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}
