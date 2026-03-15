import { MONO } from '../lib/tokens'

type LegHistoryEntry = {
  id: string
  action: string
  legRole: string
  optionType: string
  strike: string
  premiumPerContract: string
  fillDate: string
}

type LegHistoryTableProps = {
  legs: LegHistoryEntry[]
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontFamily: MONO,
  fontSize: '0.6rem',
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--wb-text-muted)',
  textAlign: 'left',
  borderBottom: '1px solid var(--wb-border)'
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontFamily: MONO,
  fontSize: '0.8125rem',
  color: 'var(--wb-text-primary)',
  borderBottom: '1px solid rgba(30,42,56,0.4)'
}

export function LegHistoryTable({ legs }: LegHistoryTableProps): React.JSX.Element {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={thStyle}>Date</th>
          <th style={thStyle}>Action</th>
          <th style={thStyle}>Type</th>
          <th style={thStyle}>Strike</th>
          <th style={thStyle}>Premium</th>
        </tr>
      </thead>
      <tbody>
        {legs.map((leg) => (
          <tr key={leg.id}>
            <td style={tdStyle}>{leg.fillDate}</td>
            <td style={tdStyle}>{leg.action}</td>
            <td style={tdStyle}>{leg.legRole}</td>
            <td style={tdStyle}>{leg.strike}</td>
            <td style={tdStyle}>{leg.premiumPerContract}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
