import { apiError } from './error'

export type AccountInfo = {
  buyingPower: string
  portfolioValue: string
  cash: string
  environment: 'paper' | 'live'
  accountNumberMasked: string
}

export async function getBrokerAccount(): Promise<AccountInfo> {
  const result = await window.api.broker.account()
  if (!result.ok) {
    throw apiError(502, { detail: result.errors })
  }
  return result.account as AccountInfo
}
