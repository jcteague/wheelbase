// Test-only: builds one session's probe plan and daily bars, pricing every option leg at a target
// IV with Black–Scholes so the IV30 engine (and anything built on it) can be asserted exactly.

import { blackScholesPrice, type OptionType } from '../black-scholes'
import { buildOccSymbol } from '../option-symbol'
import type { DailyBar } from '../iv30'
import {
  daysToExpiry,
  strikeCandidates,
  type ExpirationPair,
  type SessionProbePlan
} from '../iv30-selection'

export type ExpirationSpec = { expiration: string; sigma: number }
export type TierSpec = { near: ExpirationSpec; far?: ExpirationSpec }
export type LegKey = { expiration: string; strike: number; type: OptionType }

/** Return `null` to drop the leg's bar, or a partial bar to override fields (e.g. `tradeCount: 0`). */
export type LegOverride = (leg: LegKey) => Partial<DailyBar> | null | undefined

export type Iv30SessionFixture = {
  plan: SessionProbePlan
  underlyingBar: DailyBar
  optionBars: Map<string, DailyBar>
}

export type Iv30SessionSpec = {
  session: string
  price: number
  weekly?: TierSpec
  monthly?: TierSpec
  underlying?: string
  rate?: number
  dividendYield?: number
  tradeCount?: number
  leg?: LegOverride
}

export const FIXTURE_UNDERLYING = 'AAPL'

export function legSymbol(leg: LegKey, underlying = FIXTURE_UNDERLYING): string {
  return buildOccSymbol({
    ticker: underlying,
    expiration: leg.expiration,
    strike: leg.strike,
    instrumentType: leg.type === 'call' ? 'CALL' : 'PUT'
  })
}

export function buildIv30Session(spec: Iv30SessionSpec): Iv30SessionFixture {
  const {
    session,
    price,
    underlying = FIXTURE_UNDERLYING,
    rate = 0.045,
    dividendYield = 0,
    tradeCount = 100,
    leg = () => undefined
  } = spec
  const strikes = strikeCandidates(price)

  const legsOf = (tier: TierSpec): Array<LegKey & { sigma: number }> =>
    [tier.near, ...(tier.far ? [tier.far] : [])].flatMap(({ expiration, sigma }) =>
      strikes.flatMap((strike) =>
        (['call', 'put'] as const).map((type) => ({ expiration, strike, type, sigma }))
      )
    )

  const barFor = ({ sigma, ...key }: LegKey & { sigma: number }): [string, DailyBar] | null => {
    const override = leg(key)
    if (override === null) return null
    const vwap = blackScholesPrice({
      type: key.type,
      spot: price,
      strike: key.strike,
      yearsToExpiry: daysToExpiry(session, key.expiration) / 365,
      rate,
      dividendYield,
      volatility: sigma
    }).toFixed(4)
    const bar: DailyBar = { date: session, vwap, close: vwap, volume: tradeCount, tradeCount }
    return [legSymbol(key, underlying), { ...bar, ...override }]
  }

  const planTier = (tier: TierSpec | undefined): SessionProbePlan['weekly'] => {
    if (!tier) return null
    const pair: ExpirationPair = { near: tier.near.expiration, far: tier.far?.expiration ?? null }
    return { pair, symbols: legsOf(tier).map((l) => legSymbol(l, underlying)) }
  }

  const tiers = [spec.weekly, spec.monthly].filter((t): t is TierSpec => t !== undefined)
  const optionBars = new Map(
    tiers
      .flatMap(legsOf)
      .map(barFor)
      .filter((entry): entry is [string, DailyBar] => entry !== null)
  )
  const priceText = price.toFixed(4)
  return {
    plan: {
      session,
      underlying,
      strikes: strikeCandidates(price),
      weekly: planTier(spec.weekly),
      monthly: planTier(spec.monthly)
    },
    underlyingBar: {
      date: session,
      vwap: priceText,
      close: priceText,
      volume: 1_000_000,
      tradeCount: 10_000
    },
    optionBars
  }
}
