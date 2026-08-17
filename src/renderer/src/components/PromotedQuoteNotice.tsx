import { promoteBannerMessage, type PromoteBanner } from '../lib/promote'
import { AlertBox } from './ui/AlertBox'

const TONE: Record<Exclude<PromoteBanner['kind'], 'none'>, 'warning' | 'success'> = {
  offline: 'warning',
  stale: 'warning',
  moved: 'warning',
  edited: 'success',
  match: 'success'
}

type PromotedQuoteNoticeProps = {
  banner: PromoteBanner
}

/**
 * [US-68] The promoted form's single banner slot. Always non-blocking — no state
 * here ever disables submit; the trader is being told something, not stopped.
 */
export function PromotedQuoteNotice({
  banner
}: PromotedQuoteNoticeProps): React.JSX.Element | null {
  const message = promoteBannerMessage(banner)
  if (banner.kind === 'none' || message === null) return null

  const tone = TONE[banner.kind]
  return (
    <AlertBox variant={tone} data-testid="promote-banner" data-kind={banner.kind} data-tone={tone}>
      {tone === 'warning' ? '⚠' : '✓'} {message}
    </AlertBox>
  )
}
