import type { ReactNode } from 'react'
import { EYEBROW, SUB } from './styles'

type CardFooterCellProps = {
  label: string
  /** Text colour of the value, e.g. `text-wb-sky`. */
  valueClassName: string
  sub: string
  children: ReactNode
}

export function CardFooterCell({
  label,
  valueClassName,
  sub,
  children
}: CardFooterCellProps): React.JSX.Element {
  return (
    <div className="bg-wb-bg-elevated px-3 py-[9px]">
      <div className={EYEBROW}>{label}</div>
      <div className={`mt-[2px] font-wb-mono text-[13px] tabular-nums ${valueClassName}`}>
        {children}
      </div>
      <div className={SUB}>{sub}</div>
    </div>
  )
}
