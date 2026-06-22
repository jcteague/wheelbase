import type { MarketStatusDisplay } from '../components/MarketStatusPill'
import type { MarketStatus } from '../api/broker'

type MarketSession = MarketStatus['session']

/** Calendar-based NYSE session — accurate for regular weekdays; ignores holidays. */
export function computeNYSESession(now = new Date()): MarketSession {
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = etDate.getDay()
  if (day === 0 || day === 6) return 'closed'
  const totalMinutes = etDate.getHours() * 60 + etDate.getMinutes()
  if (totalMinutes >= 570 && totalMinutes < 960) return 'regular' // 9:30–16:00
  if (totalMinutes >= 240 && totalMinutes < 570) return 'pre' // 04:00–9:30
  if (totalMinutes >= 960 && totalMinutes < 1200) return 'post' // 16:00–20:00
  return 'closed'
}

export function deriveMarketStatusDisplay(
  session: MarketSession | undefined,
  stale: boolean
): MarketStatusDisplay {
  if (stale) return 'DELAYED'
  const s = session ?? computeNYSESession()
  if (s === 'regular') return 'LIVE'
  if (s === 'pre' || s === 'post') return 'EXT'
  return 'CLOSED'
}
