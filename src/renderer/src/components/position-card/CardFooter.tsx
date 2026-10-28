import type { ReactNode } from 'react'

/** The card's two-column footer row of `CardFooterCell`s, split by a hairline. */
export function CardFooter({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-px border-t border-wb-border bg-wb-border">{children}</div>
  )
}
