// [US-115] The Sell Short Call sheet once the sale is recorded: the cycle it opened, then Done.
import type { SellPmccShortResponse } from '../api/positions'
import { fmtMoney } from '../lib/format'
import { FormButton } from './ui/FormButton'
import { SectionCard } from './ui/SectionCard'
import { SheetBody, SheetFooter, SheetHeader } from './ui/Sheet'
import { SummaryRow } from './ui/SummaryRow'

type SellPmccShortSuccessProps = {
  response: SellPmccShortResponse
  onClose: () => void
}

export function SellPmccShortSuccess({
  response: { position, shortLeg, cycleNumber, ledger },
  onClose
}: SellPmccShortSuccessProps): React.JSX.Element {
  return (
    <>
      <SheetHeader eyebrow="SELL SHORT CALL" title="PMCC updated" onClose={onClose} />
      <SheetBody>
        <SectionCard header={`Cycle ${cycleNumber} opened`} headerVariant="emphasized">
          <div data-testid="pmcc-sell-short-success" className="flex flex-col gap-2 px-4 py-3">
            <SummaryRow
              label="Short call"
              value={`${position.ticker} ${fmtMoney(shortLeg.strike)} · ${shortLeg.expiration}`}
            />
            <SummaryRow
              label="Cost basis"
              value={`${fmtMoney(ledger.basisPerShare)} / share`}
              highlight
            />
          </div>
        </SectionCard>
      </SheetBody>
      <SheetFooter>
        <FormButton label="Done" type="button" onClick={onClose} />
      </SheetFooter>
    </>
  )
}
