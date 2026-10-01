// [US-101] The PMCC contract picker's view model. Pure: the chain arrives through
// `useCallChain`, and everything here only filters, labels and classifies it.
import { addDays, differenceInMilliseconds, format, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import { parseOccSymbol } from '../../../shared/option-symbol'
import type { OptionChainQuote } from '../api/market-data'
import { computeDteFromInput, fmtMoney } from './format'

/** One leg's chain filter: a DTE band, an absolute-delta band, and which side of the
 *  underlying price its strikes sit on. */
export type LegPreset = {
  dteMin: number
  dteMax: number | null
  deltaMin: string
  deltaMax: string
  side: 'below' | 'above'
}

export const LEAPS_PRESET: LegPreset = {
  dteMin: 180,
  dteMax: null,
  deltaMin: '0.70',
  deltaMax: '0.85',
  side: 'below'
}

export const SHORT_PRESET: LegPreset = {
  dteMin: 20,
  dteMax: 45,
  deltaMin: '0.25',
  deltaMax: '0.35',
  side: 'above'
}

/** A kind, not the copy — the `PromoteBanner` / `promoteBannerMessage` split in `lib/promote.ts`. */
export type ChainNotice = 'loading' | 'empty' | 'unavailable' | 'stale' | null

export const CHAIN_NOTICE_COPY: Record<NonNullable<ChainNotice>, string> = {
  loading: 'Loading call contracts…',
  empty: 'No matching calls. Adjust filters or enter manually.',
  unavailable: 'Quotes unavailable. Enter your filled trade manually.',
  stale: 'Quote is stale. Verify against your actual fill.'
}

export function chainNoticeMessage(notice: ChainNotice): string | null {
  return notice === null ? null : CHAIN_NOTICE_COPY[notice]
}

/** What a chain pick writes into a leg; `null` means "Enter manually". */
export type ContractSelection = { contractId: string; strike: string; expiration: string }

/** The detail page's `SNAPSHOT_STALE_THRESHOLD_MS`, so "stale" means the same thing everywhere. */
export const STALE_QUOTE_MS = 5 * 60 * 1000

export type FilterCallChainOptions = {
  /** The ticker: a contract whose OCC root differs (an adjusted contract) is dropped. */
  underlying?: string
  /** The leg's selected contract, kept in place even when its delta leaves the band. */
  keepContractId?: string
}

/**
 * The contracts whose absolute delta sits inside the preset's band (plus the kept
 * contract, in place), then every contract without Greeks — missing Greeks must never
 * hide a structurally valid contract. Adjusted-root contracts never appear: a PMCC
 * entry records standard 100-share deliverables only.
 */
export function filterCallChain(
  quotes: OptionChainQuote[],
  preset: LegPreset,
  { underlying, keepContractId }: FilterCallChainOptions = {}
): OptionChainQuote[] {
  const standard =
    underlying === undefined
      ? quotes
      : quotes.filter((q) => parseOccSymbol(q.contractId)?.underlying === underlying)
  const inBand = standard.filter((q) => {
    if (!q.greeks) return false
    if (q.contractId === keepContractId) return true
    const delta = new Decimal(q.greeks.delta).abs()
    return delta.gte(preset.deltaMin) && delta.lte(preset.deltaMax)
  })
  return [...inBand, ...standard.filter((q) => !q.greeks)]
}

/** A leg's chain request; `idle` — no valid ticker yet, so nothing was requested. */
export type ChainStatus = 'idle' | 'pending' | 'error' | 'success'

export type ChainNoticeInput = {
  status: ChainStatus
  contracts: OptionChainQuote[]
  selected?: OptionChainQuote
  now: Date
}

/** The leg's one notice, first match wins: loading > unavailable > empty > stale; none while idle. */
export function deriveChainNotice({
  status,
  contracts,
  selected,
  now
}: ChainNoticeInput): ChainNotice {
  if (status === 'idle') return null
  if (status === 'pending') return 'loading'
  if (status === 'error') return 'unavailable'
  if (contracts.length === 0) return 'empty'
  if (selected && differenceInMilliseconds(now, parseISO(selected.timestamp)) > STALE_QUOTE_MS) {
    return 'stale'
  }
  return null
}

const isoDay = (date: Date): string => format(date, 'yyyy-MM-dd')

export function chainWindow(
  preset: LegPreset,
  today: Date
): { expirationFrom: string; expirationTo?: string } {
  const expirationFrom = isoDay(addDays(today, preset.dteMin))
  return preset.dteMax === null
    ? { expirationFrom }
    : { expirationFrom, expirationTo: isoDay(addDays(today, preset.dteMax)) }
}

/** Halves the chain request when the underlying's price is known (the 250-contract page cap). */
export function strikeBounds(
  preset: LegPreset,
  underlyingPrice: string | null
): { strikeFrom?: string; strikeTo?: string } {
  if (underlyingPrice === null) return {}
  return preset.side === 'below' ? { strikeTo: underlyingPrice } : { strikeFrom: underlyingPrice }
}

export function formatContractOption(q: OptionChainQuote, today: Date): string {
  const expiration = format(parseISO(q.expiration), 'MMM d, yyyy')
  const dte = computeDteFromInput(q.expiration, today)
  const delta = q.greeks ? new Decimal(q.greeks.delta).abs().toFixed(2) : '—'
  return `${expiration} · ${fmtMoney(q.strike)} · ${dte} DTE · Δ ${delta} · mid ${fmtMoney(q.mid)}`
}
