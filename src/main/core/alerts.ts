// Pure alert-rule engine. Given a single position's evaluable inputs, returns
// the rules that matched and the rules that were skipped for missing data.
// No DB, broker, or logger imports.

import Decimal from 'decimal.js'
import { computeUnrealizedPnl } from './costbasis'
import { DEFAULT_PROFIT_TARGET_PERCENT, resolveProfitTarget } from './profit-target'
import type { WheelPhase } from './types'

export type AlertUrgency = 'high' | 'medium' | 'low'
export type AlertStatus = 'open' | 'resolved' | 'dismissed'
export type RuleCode =
  | 'EXPIRATION_IMMINENT'
  | 'MANAGEMENT_WINDOW'
  | 'PROFIT_TARGET' // US-54
  | 'STRIKE_PROXIMITY' // US-55
  | 'EARNINGS_PROXIMITY' // US-56
// (future: 'COVERED_CALL_BREACH')

/** Largest DTE that still counts as "expiration imminent" (inclusive). */
const EXPIRATION_IMMINENT_MAX_DTE = 5

/** Default upper bound of the management window, in calendar days to expiration. */
export const DEFAULT_MANAGEMENT_WINDOW_DTE = 21

/** Resolves the effective management-window DTE: per-position override wins
 *  when present, otherwise the batch/global default. */
export function resolveManagementWindowDte(
  override: number | null,
  defaultDte: number = DEFAULT_MANAGEMENT_WINDOW_DTE
): number {
  return override === null ? defaultDte : override
}

/** Widest gap between stock price and CSP strike that still warns, as a percent. */
const STRIKE_PROXIMITY_MAX_PERCENT = 1

/** Largest days-to-earnings that still counts as "earnings proximity" (inclusive). */
const EARNINGS_PROXIMITY_MAX_DAYS = 10

const QUICK_ACTION_REVIEW = 'Review position'

const MISSING_DTE = 'missing_dte'
const MISSING_OPTION_MARK = 'missing_option_mark'
const MISSING_UNDERLYING_PRICE = 'missing_underlying_price'
const MISSING_EARNINGS_DATE = 'missing_earnings_date'
const MISSING_EXPIRATION = 'missing_expiration'
const INVALID_PROFIT_TARGET_INPUT = 'invalid_profit_target_input'

/** Plain values the engine evaluates — no DB rows. */
export interface AlertEvaluationInput {
  positionId: string
  phase: WheelPhase
  instrumentType: 'PUT' | 'CALL' | null
  strike: string | null // 4dp TEXT as stored on the leg
  dte: number | null // calendar days to expiration; null when unknown
  managementWindowDte?: number // batch-level global default, falls back to DEFAULT_MANAGEMENT_WINDOW_DTE
  managementWindowDteOverride: number | null // positions.management_window_dte_override (nullable)

  // US-54 PROFIT_TARGET inputs
  entryPremiumPerContract: string | null // legs.premium_per_contract (TEXT 4dp)
  contracts: number | null // legs.contracts
  currentOptionMid: string | null // pre-fetched OptionSnapshot.mid, or null if unavailable
  profitTargetPercentOverride: number | null // positions.profit_target_percent (nullable)
  profitTargetPercentDefault?: number // batch-level global default, falls back to DEFAULT_PROFIT_TARGET_PERCENT

  // US-55 STRIKE_PROXIMITY input
  currentUnderlyingPrice: string | null // pre-fetched IpcStockQuote.price, or null if unavailable

  // US-56 EARNINGS_PROXIMITY inputs
  daysToEarnings: number | null // calendar days to next earnings; null when unknown
  expiration: string | null // legs.expiration as YYYY-MM-DD; null when unknown
}

/** Exactly the fields the PROFIT_TARGET (US-54) helpers read. */
export type ProfitTargetInput = Pick<
  AlertEvaluationInput,
  'entryPremiumPerContract' | 'contracts' | 'currentOptionMid' | 'profitTargetPercentOverride'
>

/** Exactly the fields the STRIKE_PROXIMITY (US-55) helpers read. */
export type StrikeProximityInput = Pick<AlertEvaluationInput, 'strike' | 'currentUnderlyingPrice'>

/** Exactly the fields the EARNINGS_PROXIMITY (US-56) helpers read. */
export type EarningsProximityInput = Pick<AlertEvaluationInput, 'daysToEarnings' | 'expiration'>

export interface AlertMatch {
  ruleCode: RuleCode
  urgency: AlertUrgency
  summary: string
  quickAction: string
}

export interface SkippedRule {
  ruleCode: RuleCode
  reason: string // e.g. 'missing_dte'
}

export interface PositionEvaluation {
  matches: AlertMatch[]
  skipped: SkippedRule[]
}

// ---------------------------------------------------------------------------
// Summary builders (named pure helpers)
// ---------------------------------------------------------------------------

function formatStrike(strike: string | null): string {
  return `$${new Decimal(strike ?? '0').toFixed(2)}`
}

function expirationImminentSummary(input: AlertEvaluationInput): string {
  return `Expires in ${input.dte} days at ${formatStrike(input.strike)} strike`
}

function managementWindowSummary(input: AlertEvaluationInput): string {
  return `${input.dte} DTE remaining — review for roll or close`
}

/** True when the premium/contracts satisfy computeUnrealizedPnl's preconditions,
 *  so capturedPercent can't throw. Guards against non-positive stored data. */
function hasComputableProfit(input: ProfitTargetInput): boolean {
  if (!Number.isInteger(input.contracts!) || input.contracts! < 1) return false
  try {
    return new Decimal(input.entryPremiumPerContract!).gt(0)
  } catch {
    return false
  }
}

/** Percent of max profit captured on a short option leg, as a Decimal. */
function capturedPercent(input: ProfitTargetInput): Decimal {
  return new Decimal(
    computeUnrealizedPnl({
      entryPremium: input.entryPremiumPerContract!,
      currentMid: input.currentOptionMid!,
      contracts: input.contracts!
    }).pnlPercent
  )
}

function profitTargetSummary(input: ProfitTargetInput): string {
  return `${capturedPercent(input).toFixed(1)}% of max profit captured — consider closing`
}

/** Absolute gap between the stock price and the CSP strike, as a percent Decimal. */
function proximityPercent(input: StrikeProximityInput): Decimal {
  const price = new Decimal(input.currentUnderlyingPrice!)
  const strike = new Decimal(input.strike!)
  return price.minus(strike).abs().dividedBy(strike).times(100)
}

function strikeProximitySummary(input: StrikeProximityInput): string {
  const price = new Decimal(input.currentUnderlyingPrice!)
  const strike = new Decimal(input.strike!)
  const pct = proximityPercent(input).toFixed(1)
  const direction = price.gte(strike) ? 'above' : 'below'
  const base = `Stock is ${pct}% ${direction} the ${formatStrike(input.strike)} put strike`
  return direction === 'below' ? `${base} — now in the money` : base
}

function earningsProximitySummary(input: EarningsProximityInput): string {
  const days = input.daysToEarnings!
  const when = days === 0 ? 'today' : days === 1 ? 'in 1 day' : `in ${days} days`
  return `Earnings ${when} before your ${input.expiration} expiration`
}

// ---------------------------------------------------------------------------
// Rule registry — ordered list of pure predicates. Append future rules here
// without touching the evaluation loop. The two DTE rules are mutually exclusive
// by their DTE ranges (EXPIRATION_IMMINENT takes precedence over MANAGEMENT_WINDOW);
// PROFIT_TARGET and STRIKE_PROXIMITY are independent and may co-fire with them.
// Each rule declares its own `missingData` guard, so a rule is skipped only when
// its own required inputs are absent.
// ---------------------------------------------------------------------------

/** Per-position thresholds resolved once per evaluation, combining each
 *  field's override (if any) with its batch/global default. */
interface ResolvedThresholds {
  managementWindowDte: number
  profitTargetPercent: number
}

interface RuleDefinition {
  code: RuleCode
  urgency: AlertUrgency
  // Returns a skip reason when a required input is absent, else null.
  missingData?: (input: AlertEvaluationInput) => string | null
  test: (input: AlertEvaluationInput, resolved: ResolvedThresholds) => boolean
  summary: (input: AlertEvaluationInput) => string
}

const missingDteReason = (input: AlertEvaluationInput): string | null =>
  input.dte === null ? MISSING_DTE : null

const RULES: RuleDefinition[] = [
  {
    code: 'EXPIRATION_IMMINENT',
    urgency: 'high',
    missingData: missingDteReason,
    test: (input) =>
      input.dte !== null && input.dte >= 0 && input.dte <= EXPIRATION_IMMINENT_MAX_DTE,
    summary: expirationImminentSummary
  },
  {
    code: 'MANAGEMENT_WINDOW',
    urgency: 'medium',
    missingData: missingDteReason,
    test: (input, resolved) =>
      input.dte !== null &&
      input.dte > EXPIRATION_IMMINENT_MAX_DTE &&
      input.dte <= resolved.managementWindowDte,
    summary: managementWindowSummary
  },
  {
    code: 'PROFIT_TARGET',
    urgency: 'low',
    missingData: (input) => {
      if (
        input.entryPremiumPerContract === null ||
        input.contracts === null ||
        input.currentOptionMid === null
      ) {
        return MISSING_OPTION_MARK
      }
      return hasComputableProfit(input) ? null : INVALID_PROFIT_TARGET_INPUT
    },
    test: (input, resolved) => capturedPercent(input).gte(resolved.profitTargetPercent),
    summary: profitTargetSummary
  },
  {
    code: 'STRIKE_PROXIMITY',
    urgency: 'medium',
    missingData: (input) =>
      input.phase === 'CSP_OPEN' && input.currentUnderlyingPrice === null
        ? MISSING_UNDERLYING_PRICE
        : null,
    test: (input) =>
      input.phase === 'CSP_OPEN' &&
      input.strike !== null &&
      input.currentUnderlyingPrice !== null &&
      proximityPercent(input).lte(STRIKE_PROXIMITY_MAX_PERCENT),
    summary: strikeProximitySummary
  },
  {
    code: 'EARNINGS_PROXIMITY',
    urgency: 'medium',
    // Guards every field the test and summary read: dte, expiration (interpolated
    // into the summary), and the earnings date itself.
    missingData: (input) =>
      missingDteReason(input) ??
      (input.expiration === null ? MISSING_EXPIRATION : null) ??
      (input.daysToEarnings === null ? MISSING_EARNINGS_DATE : null),
    test: (input) =>
      input.daysToEarnings !== null &&
      input.dte !== null &&
      input.daysToEarnings >= 0 &&
      input.daysToEarnings <= EARNINGS_PROXIMITY_MAX_DAYS &&
      input.daysToEarnings <= input.dte,
    summary: earningsProximitySummary
  }
]

export function evaluatePosition(input: AlertEvaluationInput): PositionEvaluation {
  const resolved: ResolvedThresholds = {
    managementWindowDte: resolveManagementWindowDte(
      input.managementWindowDteOverride,
      input.managementWindowDte ?? DEFAULT_MANAGEMENT_WINDOW_DTE
    ),
    profitTargetPercent: resolveProfitTarget(
      input.profitTargetPercentOverride,
      input.profitTargetPercentDefault ?? DEFAULT_PROFIT_TARGET_PERCENT
    )
  }
  const skipReason = (rule: RuleDefinition): string | null =>
    rule.missingData ? rule.missingData(input) : null

  const skipped = RULES.flatMap((rule): SkippedRule[] => {
    const reason = skipReason(rule)
    return reason === null ? [] : [{ ruleCode: rule.code, reason }]
  })

  const matches = RULES.filter(
    (rule) => skipReason(rule) === null && rule.test(input, resolved)
  ).map(
    (rule): AlertMatch => ({
      ruleCode: rule.code,
      urgency: rule.urgency,
      summary: rule.summary(input),
      quickAction: QUICK_ACTION_REVIEW
    })
  )

  return { matches, skipped }
}
