// [US-115] The `After this sale` card: credit and DTE, the ledger from → to, and the strike's
// place against the effective share cost after the sale — the green margin or the gold advisory.
import { fmtMoney, fmtPct1 } from '../lib/format'
import { shortfallWarningText } from '../lib/pmcc-roll'
import {
  uncoveredContractsNote,
  type SellPmccShortPreview as SellPmccShortPreviewValue
} from '../lib/pmcc-sell-short'
import { AlertBox } from './ui/AlertBox'
import { SectionCard } from './ui/SectionCard'

type SellPmccShortPreviewProps = {
  /** `null` while the draft is incomplete. */
  preview: SellPmccShortPreviewValue | null
  /** The entered strike, as typed. */
  strike: string
  /** Whether the whole entry is valid; the strike line waits for it. */
  valid: boolean
}

/** `70.9%`; `—` for a ledger with no LEAPS cost to recover. */
function recovered(percent: string | null): string {
  return percent === null ? '—' : fmtPct1(percent)
}

type PreviewLineProps = {
  testId: string
  label: string
  value: string
  highlight?: boolean
}

function PreviewLine({ testId, label, value, highlight }: PreviewLineProps): React.JSX.Element {
  return (
    <div
      data-testid={testId}
      className={`flex justify-between gap-3 text-xs ${highlight ? 'bg-gradient-to-r from-wb-gold-subtle to-transparent py-1' : ''}`}
    >
      <span className="text-wb-text-muted">{label}</span>{' '}
      <span className="text-right">{value}</span>
    </div>
  )
}

/** The strike against the effective share cost after the sale, once the entry is valid. */
function StrikeGuardrail({
  preview,
  strike,
  valid
}: {
  preview: SellPmccShortPreviewValue
  strike: string
  valid: boolean
}): React.JSX.Element {
  if (!valid) {
    return (
      <div
        data-testid="pmcc-sell-short-guardrail-pending"
        className="mt-1 font-wb-mono text-xs text-wb-text-muted"
      >
        Fix the errors above to see the guardrails
      </div>
    )
  }
  const { strikeLine, to } = preview
  if (strikeLine.kind === 'shortfall') {
    return (
      <AlertBox variant="warning" data-testid="pmcc-sell-short-warning">
        {shortfallWarningText({
          strike,
          effectiveAfter: to.effectiveShareCost,
          shortfall: strikeLine.shortfall,
          event: 'sale'
        })}
      </AlertBox>
    )
  }
  return (
    <div
      data-testid="pmcc-sell-short-strike-line"
      className="mt-1 font-wb-mono text-xs text-wb-green"
    >
      Strike {fmtMoney(strike)} is +{fmtMoney(strikeLine.margin)} above your effective share cost
    </div>
  )
}

export function SellPmccShortPreview({
  preview,
  strike,
  valid
}: SellPmccShortPreviewProps): React.JSX.Element {
  return (
    <SectionCard header="After this sale" headerVariant="emphasized">
      <div data-testid="pmcc-sell-short-preview" className="flex flex-col gap-1.5 p-4">
        {preview === null ? (
          <span className="text-center text-xs text-wb-text-muted">
            Enter a strike, expiration and sale price to preview this sale.
          </span>
        ) : (
          <>
            <PreviewLine
              testId="pmcc-sell-short-credit"
              label="Credit"
              value={`${fmtMoney(preview.creditTotal)} · ${preview.dte} DTE`}
            />
            <PreviewLine
              testId="pmcc-sell-short-basis"
              label="Cost basis after:"
              value={`${fmtMoney(preview.to.basisPerShare)} / share (from ${fmtMoney(preview.from.basisPerShare)})`}
              highlight
            />
            <PreviewLine
              testId="pmcc-sell-short-effective"
              label="Effective share cost after:"
              value={`${fmtMoney(preview.to.effectiveShareCost)} (from ${fmtMoney(preview.from.effectiveShareCost)})`}
            />
            <PreviewLine
              testId="pmcc-sell-short-recovered"
              label="Premium recovered after:"
              value={`${recovered(preview.to.premiumRecoveredPercent)} (from ${recovered(preview.from.premiumRecoveredPercent)})`}
            />
            <StrikeGuardrail preview={preview} strike={strike} valid={valid} />
            {preview.uncoveredContracts > 0 ? (
              <p
                data-testid="pmcc-sell-short-uncovered"
                className="text-[11px] leading-relaxed text-wb-text-secondary"
              >
                {uncoveredContractsNote(preview.uncoveredContracts)}
              </p>
            ) : null}
          </>
        )}
      </div>
    </SectionCard>
  )
}
