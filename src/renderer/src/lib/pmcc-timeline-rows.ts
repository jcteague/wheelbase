// [US-109] The PMCC leg timeline's row copy: every cell of a LEAPS-track or short-call cycle
// row, formatted from the engine's rows. The engine's row totals are unsigned; a cell is signed
// here by which way the row's cash went. Formatting only — every figure is computed in main.
import Decimal from 'decimal.js'
import type {
  ContractRef,
  PmccCycle,
  PmccCycleRow,
  PmccLeapsRollCoverage,
  PmccLeapsRow,
  PmccNet,
  PmccShortOutcome
} from '../../../main/core/pmcc-timeline'
import { fmtCount, fmtMoneyGrouped as money } from './format'

type RowOf<Row, Kind> = Extract<Row, { kind: Kind }>

/** A row's price-per-share and total cells. */
export type RowAmounts = { price: string; total: string }

/** The rows that move cash at a fill price. */
export type AmountRow =
  | RowOf<PmccLeapsRow, 'PURCHASE'>
  | RowOf<PmccLeapsRow, 'CLOSE'>
  | RowOf<PmccCycleRow, 'OPEN'>
  | RowOf<PmccCycleRow, 'END'>

const DASH = '—'

/** `$80.00 call · 2027-09-17`. */
export function contractLabel(contract: ContractRef): string {
  return `${money(contract.strike)} call · ${contract.expiration}`
}

/** `$80.00 2027-09-17 → $85.00 2028-01-21`. */
export function rollContractLabel({ from, to }: { from: ContractRef; to: ContractRef }): string {
  return `${money(from.strike)} ${from.expiration} → ${money(to.strike)} ${to.expiration}`
}

export function leapsRollPrices({
  from,
  to
}: Pick<RowOf<PmccLeapsRow, 'ROLL'>, 'from' | 'to'>): string {
  return `sell ${money(from.pricePerShare)} / buy ${money(to.pricePerShare)}`
}

export function shortRollPrices({
  from,
  to
}: Pick<RowOf<PmccCycleRow, 'ROLL'>, 'from' | 'to'>): string {
  return `buy ${money(from.pricePerShare)} / sell ${money(to.pricePerShare)}`
}

/** `Net credit $2.50 ($250.00)`, `Net debit $0.60 ($60.00)`. */
export function netLabel(net: PmccNet): string {
  return `Net ${net.direction} ${money(net.perShare)} (${money(net.total)})`
}

/** ` · fees $1.00`, or empty when the fee is zero. */
export function feesSuffix(fees: string): string {
  return new Decimal(fees).isZero() ? '' : ` · fees ${money(fees)}`
}

/** An unsigned engine figure signed by which way the cash went. */
const cash = (inflow: boolean, value: string): string => `${inflow ? '+' : '−'}${money(value)}`

/** A fill row's price and total, signed by the cash direction, the total carrying any fee. */
function fillAmounts(inflow: boolean, price: string, total: string, fees: string): RowAmounts {
  return { price: cash(inflow, price), total: `${cash(inflow, total)}${feesSuffix(fees)}` }
}

function terminalAmounts(row: RowOf<PmccCycleRow, 'END'>): RowAmounts {
  switch (row.outcome) {
    case 'EXPIRED':
      return { price: 'expired worthless', total: DASH }
    case 'ASSIGNED':
      return { price: '— (assigned)', total: 'settlement recorded by US-111' }
    case 'CLOSED':
      return fillAmounts(false, row.pricePerShare, row.total, row.fees)
  }
}

export function rowAmounts(row: AmountRow): RowAmounts {
  switch (row.kind) {
    case 'PURCHASE':
      return fillAmounts(false, row.contract.pricePerShare, row.total, row.fees)
    case 'CLOSE':
    case 'OPEN':
      return fillAmounts(true, row.contract.pricePerShare, row.total, row.fees)
    case 'END':
      return terminalAmounts(row)
  }
}

/**
 * How a cycle stands: its outcome once ended, `OPEN` while open, `UNRECORDED` once its short is
 * past expiration with no outcome recorded.
 */
export type CycleOutcome = PmccShortOutcome | 'OPEN' | 'UNRECORDED'

const OUTCOME_LABEL: Record<CycleOutcome, string> = {
  EXPIRED: 'Expired worthless',
  CLOSED: 'Closed early',
  ASSIGNED: 'Assigned',
  OPEN: 'Open',
  UNRECORDED: 'Outcome not recorded'
}

export function outcomeLabel(outcome: CycleOutcome): string {
  return OUTCOME_LABEL[outcome]
}

export function leapsEventLabel(row: PmccLeapsRow): string {
  switch (row.kind) {
    case 'PURCHASE':
      return 'Buy LEAPS'
    case 'ROLL':
      return `LEAPS roll #${row.number}`
    case 'CLOSE':
      return 'Sold to close'
    case 'UNKNOWN':
      return row.role
  }
}

export function cycleEventLabel(row: PmccCycleRow): string {
  switch (row.kind) {
    case 'OPEN':
      return 'Sell to open'
    case 'ROLL':
      return `Roll #${row.number}`
    case 'UNKNOWN':
      return row.role
    case 'END':
      return outcomeLabel(row.outcome)
  }
}

/** `opens coverage · 368 DTE at fill`, `unbroken · +126 days`, `2 day gap · +126 days`. */
export function leapsCoverageCell(
  row:
    | Pick<RowOf<PmccLeapsRow, 'PURCHASE'>, 'kind' | 'dteAtFill'>
    | (Pick<RowOf<PmccLeapsRow, 'ROLL'>, 'kind'> & { coverage: PmccLeapsRollCoverage })
): string {
  if (row.kind === 'PURCHASE') return `opens coverage · ${row.dteAtFill} DTE at fill`
  const { coverage } = row
  const continuity = coverage.unbroken ? 'unbroken' : `${coverage.gapDays} day gap`
  return `${continuity} · +${fmtCount(coverage.extensionDays, 'day')}`
}

/** The basis after a LEAPS purchase or roll; a sale to close or unknown row has none. */
export function leapsBasisCell(row: PmccLeapsRow): string {
  return row.kind === 'PURCHASE' || row.kind === 'ROLL' ? money(row.basisAfter) : DASH
}

export function openCycleRow({
  dteRemaining
}: Pick<Extract<PmccCycle, { status: 'OPEN' }>, 'dteRemaining'>): string {
  return `${dteRemaining} DTE remaining · credit collected, not realized`
}

export function unrecordedCycleRow({
  expiredOn
}: Pick<Extract<PmccCycle, { status: 'UNRECORDED' }>, 'expiredOn'>): string {
  return `Expired ${expiredOn} · outcome not recorded`
}

/** `Cycle 2`. */
export function cycleTitle(number: number): string {
  return `Cycle ${number}`
}

export function cycleOutcome(
  cycle:
    | { status: 'OPEN' }
    | { status: 'UNRECORDED' }
    | { status: 'ENDED'; outcome: PmccShortOutcome }
): CycleOutcome {
  return cycle.status === 'ENDED' ? cycle.outcome : cycle.status
}

/** A roll row's net cell: `Net debit $0.60 ($60.00)`, plus any fee. */
export function rollNetCell(row: { net: PmccNet; fees: string }): string {
  return `${netLabel(row.net)}${feesSuffix(row.fees)}`
}
