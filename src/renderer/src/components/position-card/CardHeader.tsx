import type { ReactNode } from 'react'

const TICKER_LINK =
  'font-wb-mono text-[15px] font-bold tracking-[0.04em] text-wb-text-primary no-underline hover:underline hover:underline-offset-[3px]'

const OPEN_LINK =
  'inline-flex items-center gap-1 rounded border border-wb-border px-2 py-[3px] font-wb-mono text-[10px] font-semibold tracking-[0.08em] text-wb-text-secondary no-underline whitespace-nowrap hover:border-wb-text-muted hover:bg-wb-bg-elevated hover:text-wb-text-primary'

type CardHeaderProps = {
  /** The position detail page, the target of both the ticker and `Open ↗`. */
  href: string
  ticker: string
  /** The right-hand price block, just before `Open ↗`. */
  price: ReactNode
  /** Badges and flags that follow the ticker. */
  children?: ReactNode
}

export function CardHeader({ href, ticker, price, children }: CardHeaderProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 border-b border-wb-border-subtle px-[13px] py-[11px]">
      <a href={href} data-testid="position-ticker" className={TICKER_LINK}>
        {ticker}
      </a>
      {children}
      <span className="ml-auto" />
      {price}
      <a href={href} title="Open the position detail page" className={OPEN_LINK}>
        Open ↗
      </a>
    </div>
  )
}
