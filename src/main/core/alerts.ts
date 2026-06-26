// Pure alert-rule engine. Given a single position's evaluable inputs, returns
// the rules that matched and the rules that were skipped for missing data.
// No DB, broker, or logger imports.

import Decimal from 'decimal.js'
import type { WheelPhase } from './types'

export type AlertUrgency = 'high' | 'medium' | 'low'
export type AlertStatus = 'open' | 'resolved' | 'dismissed'
export type RuleCode = 'EXPIRATION_IMMINENT' | 'MANAGEMENT_WINDOW'
// (future: 'PROFIT_TARGET' | 'STRIKE_PROXIMITY' | 'EARNINGS_PROXIMITY' | 'COVERED_CALL_BREACH')

/** Largest DTE that still counts as "expiration imminent" (inclusive). */
const EXPIRATION_IMMINENT_MAX_DTE = 5

/** Default upper bound of the management window, in calendar days to expiration. */
export const DEFAULT_MANAGEMENT_WINDOW_DTE = 21

const QUICK_ACTION_REVIEW = 'Review position'

const MISSING_DTE = 'missing_dte'

/** Plain values the engine evaluates — no DB rows. */
export interface AlertEvaluationInput {
  positionId: string
  phase: WheelPhase
  instrumentType: 'PUT' | 'CALL' | null
  strike: string | null // 4dp TEXT as stored on the leg
  dte: number | null // calendar days to expiration; null when unknown
  managementWindowDte?: number // defaults to DEFAULT_MANAGEMENT_WINDOW_DTE
}

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

// ---------------------------------------------------------------------------
// Rule registry — ordered list of pure predicates. Append future rules here
// without touching the evaluation loop; their DTE ranges are mutually exclusive,
// so EXPIRATION_IMMINENT naturally takes precedence over MANAGEMENT_WINDOW.
// ---------------------------------------------------------------------------

interface RuleDefinition {
  code: RuleCode
  urgency: AlertUrgency
  requiresDte: boolean
  test: (input: AlertEvaluationInput, managementWindowDte: number) => boolean
  summary: (input: AlertEvaluationInput) => string
}

const RULES: RuleDefinition[] = [
  {
    code: 'EXPIRATION_IMMINENT',
    urgency: 'high',
    requiresDte: true,
    test: (input) =>
      input.dte !== null && input.dte >= 0 && input.dte <= EXPIRATION_IMMINENT_MAX_DTE,
    summary: expirationImminentSummary
  },
  {
    code: 'MANAGEMENT_WINDOW',
    urgency: 'medium',
    requiresDte: true,
    test: (input, managementWindowDte) =>
      input.dte !== null &&
      input.dte > EXPIRATION_IMMINENT_MAX_DTE &&
      input.dte <= managementWindowDte,
    summary: managementWindowSummary
  }
]

export function evaluatePosition(input: AlertEvaluationInput): PositionEvaluation {
  const managementWindowDte = input.managementWindowDte ?? DEFAULT_MANAGEMENT_WINDOW_DTE
  const hasMissingData = (rule: RuleDefinition): boolean => rule.requiresDte && input.dte === null

  const skipped = RULES.filter(hasMissingData).map(
    (rule): SkippedRule => ({ ruleCode: rule.code, reason: MISSING_DTE })
  )

  const matches = RULES.filter(
    (rule) => !hasMissingData(rule) && rule.test(input, managementWindowDte)
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
