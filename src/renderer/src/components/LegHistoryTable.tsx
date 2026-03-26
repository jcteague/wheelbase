import { LEG_ROLE_LABEL } from '../lib/phase'
import { TableCell, TableHeader } from './ui/TablePrimitives'

type LegHistoryEntry = {
  id: string
  action: string
  legRole: string
  instrumentType: string
  strike: string
  premiumPerContract: string
  fillDate: string
}

type LegHistoryTableProps = {
  legs: LegHistoryEntry[]
}

export function LegHistoryTable({ legs }: LegHistoryTableProps): React.JSX.Element {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <TableHeader>Date</TableHeader>
          <TableHeader>Action</TableHeader>
          <TableHeader>Type</TableHeader>
          <TableHeader>Strike</TableHeader>
          <TableHeader>Premium</TableHeader>
        </tr>
      </thead>
      <tbody>
        {legs.map((leg) => (
          <tr key={leg.id}>
            <TableCell>{leg.fillDate}</TableCell>
            <TableCell>{leg.action}</TableCell>
            <TableCell>{LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole}</TableCell>
            <TableCell>{leg.strike}</TableCell>
            <TableCell>{leg.premiumPerContract}</TableCell>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
