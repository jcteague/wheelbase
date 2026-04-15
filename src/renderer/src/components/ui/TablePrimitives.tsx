import { twMerge } from 'tailwind-merge'

type TableHeaderProps = {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function TableHeader({ children, className, style }: TableHeaderProps): React.JSX.Element {
  return (
    <th
      className={twMerge(
        'text-wb-text-muted font-wb-mono text-xs font-semibold tracking-widest uppercase',
        'text-left border-b border-wb-border px-[12px] py-[8px]',
        className
      )}
      style={style}
    >
      {children}
    </th>
  )
}

type TableCellProps = {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function TableCell({ children, className, style }: TableCellProps): React.JSX.Element {
  return (
    <td
      className={twMerge(
        'font-wb-mono text-wb-text-primary px-[12px] py-[8px]',
        'border-b border-[rgba(30,42,56,0.4)]',
        className
      )}
      style={style}
    >
      {children}
    </td>
  )
}
