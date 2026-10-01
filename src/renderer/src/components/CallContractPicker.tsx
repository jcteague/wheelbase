// [US-101] One leg's chain picker: a native select over the leg's filtered call chain,
// an `Enter manually` escape hatch, and the leg's one market-data notice. The notice
// never disables anything — manual entry is always available.
import Decimal from 'decimal.js'
import type { UseCallChainResult } from '../hooks/useCallChain'
import {
  chainNoticeMessage,
  deriveChainNotice,
  formatContractOption,
  type ContractSelection
} from '../lib/pmcc-entry'
import { FieldLabel } from './ui/FormField'

type CallContractPickerProps = {
  /** The select's id, e.g. `long-contract`. */
  id: string
  chain: UseCallChainResult
  selectedContractId?: string
  onSelect: (selection: ContractSelection | null) => void
  today: Date
}

export function CallContractPicker({
  id,
  chain,
  selectedContractId,
  onSelect,
  today
}: CallContractPickerProps): React.JSX.Element {
  const selected = chain.contracts.find((q) => q.contractId === selectedContractId)
  const notice = chainNoticeMessage(
    deriveChainNotice({
      status: chain.status,
      contracts: chain.contracts,
      selected,
      now: new Date()
    })
  )

  function handleChange(contractId: string): void {
    const quote = chain.contracts.find((q) => q.contractId === contractId)
    onSelect(
      quote
        ? {
            contractId: quote.contractId,
            strike: new Decimal(quote.strike).toFixed(2),
            expiration: quote.expiration
          }
        : null
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel htmlFor={id}>Contract</FieldLabel>
      <div className="flex items-center gap-2">
        <select
          id={id}
          value={selectedContractId ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          className="min-w-0 flex-1 cursor-pointer rounded-md border border-wb-border bg-wb-bg-elevated px-3 py-2 font-wb-mono text-[0.8125rem] text-wb-text-primary"
        >
          <option value="">Choose contract / enter manually</option>
          {chain.contracts.map((q) => (
            <option key={q.contractId} value={q.contractId}>
              {formatContractOption(q, today)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="cursor-pointer border-none bg-transparent px-1 font-wb-mono text-[0.72rem] text-wb-teal"
        >
          Enter manually
        </button>
      </div>
      {notice ? (
        <div
          role="status"
          className="rounded border border-wb-border bg-wb-gold-dim p-3 font-wb-mono text-xs text-wb-gold"
        >
          {notice}
        </div>
      ) : null}
    </div>
  )
}
