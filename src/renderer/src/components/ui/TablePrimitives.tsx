import { MONO } from '../../lib/tokens'

type TableHeaderProps = {
  children: React.ReactNode
  style?: React.CSSProperties
}

export function TableHeader({ children, style }: TableHeaderProps): React.JSX.Element {
  return (
    <th
      style={{
        padding: '8px 12px',
        fontFamily: MONO,
        fontSize: '0.65rem',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--wb-text-muted)',
        textAlign: 'left',
        borderBottom: '1px solid var(--wb-border)',
        ...style
      }}
    >
      {children}
    </th>
  )
}

type TableCellProps = {
  children: React.ReactNode
  style?: React.CSSProperties
}

export function TableCell({ children, style }: TableCellProps): React.JSX.Element {
  return (
    <td
      style={{
        padding: '8px 12px',
        fontFamily: MONO,
        fontSize: '0.8125rem',
        color: 'var(--wb-text-primary)',
        borderBottom: '1px solid rgba(30,42,56,0.4)',
        ...style
      }}
    >
      {children}
    </td>
  )
}
