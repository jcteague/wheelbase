// IV30 reading engine — one session's 30-day implied volatility from daily option VWAPs.
// Pure engine — no database or broker imports allowed here.
//
// Rules: data-model.md §2 iv30.ts; research.md ADR "Contract selection is generic over candidate
// expirations; one-sided brackets do not extrapolate".

import Decimal from 'decimal.js'
import { impliedVolatility, type OptionType } from './black-scholes'
import {
  TARGET_DTE,
  daysToExpiry,
  type ExpirationPair,
  type ExpirationTier,
  type SessionProbePlan
} from './iv30-selection'
import { buildOccSymbol } from './option-symbol'

export const IV30_METHOD = 'daily_vwap'
export const IV30_ENGINE_VERSION = 1
export const DEFAULT_RISK_FREE_RATE = '0.0450'
export const DEFAULT_DIVIDEND_YIELD = '0.0000'
export const MIN_TRADES_PER_LEG = 1

const DAYS_PER_YEAR = 365
const TIERS: readonly ExpirationTier[] = ['weekly', 'monthly']

export type DailyBar = {
  date: string
  vwap: string
  close: string
  volume: number
  tradeCount: number
}

export type LegSelection = {
  expiration: string
  strike: string // 4 dp
  callVwap: string
  callTrades: number
  putVwap: string
  putTrades: number
}

export type Iv30Inputs = {
  session: string
  underlyingVwap: string
  tier: ExpirationTier
  near: LegSelection
  far: LegSelection | null
  rate: string
  dividendYield: string
}

export type Iv30Reading = Iv30Inputs & { iv30: string; engineVersion: number }

export type Iv30GapReason = 'no_underlying_bar' | 'no_tradeable_pair'

export type Iv30Outcome =
  | { status: 'reading'; reading: Iv30Reading }
  | { status: 'gap'; reason: Iv30GapReason }

type Market = { session: string; spot: number; rate: number; dividendYield: number }
type ExpirationPoint = { yearsToExpiry: number; iv: number }

const fourDp = (x: number | string): string => new Decimal(x).toFixed(4)

/** mean(callIV, putIV) for one expiration's chosen strike; null when either leg fails to invert. */
function expirationIv(leg: LegSelection, market: Market): ExpirationPoint | null {
  const yearsToExpiry = daysToExpiry(market.session, leg.expiration) / DAYS_PER_YEAR
  const invert = (type: OptionType, vwap: string): number | null =>
    impliedVolatility({
      type,
      spot: market.spot,
      strike: Number(leg.strike),
      yearsToExpiry,
      rate: market.rate,
      dividendYield: market.dividendYield,
      price: Number(vwap)
    })
  const callIv = invert('call', leg.callVwap)
  const putIv = invert('put', leg.putVwap)
  return callIv === null || putIv === null ? null : { yearsToExpiry, iv: (callIv + putIv) / 2 }
}

/** Total-variance interpolation to 30 days; a lone expiration is used flat. */
function interpolateTotalVariance(near: ExpirationPoint, far: ExpirationPoint | null): number {
  if (far === null) return near.iv
  const t30 = TARGET_DTE / DAYS_PER_YEAR
  const lambda = (t30 - near.yearsToExpiry) / (far.yearsToExpiry - near.yearsToExpiry)
  const w30 =
    near.iv ** 2 * near.yearsToExpiry * (1 - lambda) + far.iv ** 2 * far.yearsToExpiry * lambda
  return Math.sqrt(w30 / t30)
}

function iv30Of(inputs: Iv30Inputs): number | null {
  const market: Market = {
    session: inputs.session,
    spot: Number(inputs.underlyingVwap),
    rate: Number(inputs.rate),
    dividendYield: Number(inputs.dividendYield)
  }
  const near = expirationIv(inputs.near, market)
  const far = inputs.far === null ? null : expirationIv(inputs.far, market)
  if (near === null || (inputs.far !== null && far === null)) return null
  return interpolateTotalVariance(near, far)
}

/** Pure: the same arithmetic over stored inputs. null when an inversion fails on the stored inputs. */
export function iv30FromInputs(inputs: Iv30Inputs): string | null {
  const iv30 = iv30Of(inputs)
  return iv30 === null ? null : fourDp(iv30)
}

type PricedLeg = { leg: LegSelection; point: ExpirationPoint }
type PricedTier = { near: PricedLeg; far: PricedLeg | null }

/** Nearest strike whose call and put both traded and both invert, with the IV it inverted to. */
function selectLeg(
  plan: SessionProbePlan,
  expiration: string,
  optionBars: ReadonlyMap<string, DailyBar>,
  market: Market
): PricedLeg | null {
  const barOf = (strike: number, instrumentType: 'CALL' | 'PUT'): DailyBar | undefined =>
    optionBars.get(buildOccSymbol({ ticker: plan.underlying, expiration, strike, instrumentType }))
  const traded = (bar: DailyBar | undefined): bar is DailyBar =>
    bar !== undefined && bar.tradeCount >= MIN_TRADES_PER_LEG

  const pricedAt = (strike: number): PricedLeg | null => {
    const call = barOf(strike, 'CALL')
    const put = barOf(strike, 'PUT')
    if (!traded(call) || !traded(put)) return null
    const leg: LegSelection = {
      expiration,
      strike: fourDp(strike),
      callVwap: call.vwap,
      callTrades: call.tradeCount,
      putVwap: put.vwap,
      putTrades: put.tradeCount
    }
    const point = expirationIv(leg, market)
    return point === null ? null : { leg, point }
  }

  return plan.strikes.map(pricedAt).find((priced) => priced !== null) ?? null
}

function selectTier(
  plan: SessionProbePlan,
  pair: ExpirationPair,
  optionBars: ReadonlyMap<string, DailyBar>,
  market: Market
): PricedTier | null {
  const near = selectLeg(plan, pair.near, optionBars, market)
  const far = pair.far === null ? null : selectLeg(plan, pair.far, optionBars, market)
  if (near === null || (pair.far !== null && far === null)) return null
  return { near, far }
}

/** Pure: pick the strike per expiration, average call/put IV, interpolate in total variance. */
export function computeIv30(input: {
  plan: SessionProbePlan
  underlyingBar: DailyBar | undefined
  optionBars: ReadonlyMap<string, DailyBar>
  rate?: string
  dividendYield?: string
}): Iv30Outcome {
  const { plan, underlyingBar, optionBars } = input
  if (underlyingBar === undefined) return { status: 'gap', reason: 'no_underlying_bar' }

  const rate = fourDp(input.rate ?? DEFAULT_RISK_FREE_RATE)
  const dividendYield = fourDp(input.dividendYield ?? DEFAULT_DIVIDEND_YIELD)
  const market: Market = {
    session: plan.session,
    spot: Number(underlyingBar.vwap),
    rate: Number(rate),
    dividendYield: Number(dividendYield)
  }

  const chosen = TIERS.map((tier) => {
    const probe = plan[tier]
    const priced = probe === null ? null : selectTier(plan, probe.pair, optionBars, market)
    return priced === null ? null : { tier, priced }
  }).find((selection) => selection !== null)
  if (!chosen) return { status: 'gap', reason: 'no_tradeable_pair' }

  const { tier, priced } = chosen
  const iv30 = interpolateTotalVariance(priced.near.point, priced.far?.point ?? null)
  return {
    status: 'reading',
    reading: {
      session: plan.session,
      underlyingVwap: underlyingBar.vwap,
      tier,
      near: priced.near.leg,
      far: priced.far?.leg ?? null,
      rate,
      dividendYield,
      iv30: fourDp(iv30),
      engineVersion: IV30_ENGINE_VERSION
    }
  }
}
