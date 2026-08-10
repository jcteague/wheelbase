import { format, parseISO } from 'date-fns'
import Decimal from 'decimal.js'
import type { ScreenerIvRank } from '../api/screener'
import { fmtMoney, fmtPct } from './format'

export function fmtYieldPercent(fraction: string): string {
  return `${new Decimal(fraction).times(100).toDecimalPlaces(2).toString()}%`
}

export function fmtScore(value: string): string {
  return new Decimal(value).toFixed(2)
}

export function fmtSpread(absolute: string, percent: string): string {
  return `${fmtMoney(absolute)} (${fmtPct(Number(percent))})`
}

export function fmtDelta(value: string): string {
  return new Decimal(value).toFixed(2)
}

export function fmtIvr(ivRank: ScreenerIvRank | null): string {
  return ivRank === null ? 'n/a' : new Decimal(ivRank.value).toString()
}

export function fmtOpenInterest(openInterest: number | null): string {
  return openInterest === null ? '—' : openInterest.toLocaleString('en-US')
}

export function fmtQuoteTime(timestamp: string): string {
  return format(parseISO(timestamp), 'HH:mm:ss')
}
