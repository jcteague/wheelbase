/* eslint-disable @typescript-eslint/explicit-function-return-type -- one-off check, plain JS */
// One-off check (US-121 review item): is a date-only `end` on Alpaca's daily-bars endpoints
// inclusive of that day's bar? Daily bars are stamped at Eastern midnight (T04:00Z / T05:00Z),
// so if `end=YYYY-MM-DD` were read as 00:00Z the named session's bar would be dropped.
//
//   ALPACA_KEY_ID=… ALPACA_SECRET_KEY=… node scripts/check-bars-end-inclusive.mjs
//
// Read-only market-data requests; `end` is always a completed past session.
const KEY = process.env.ALPACA_KEY_ID
const SECRET = process.env.ALPACA_SECRET_KEY
if (!KEY || !SECRET) {
  console.error('Set ALPACA_KEY_ID and ALPACA_SECRET_KEY')
  process.exit(1)
}

const DATA = 'https://data.alpaca.markets'
const OPTION = 'AAPL261023C00340000' // AAPL's stored 2026-09-25 near call
const START = '2026-09-21'
const ENDS = ['2026-09-24', '2026-09-25'] // Thursday, Friday — both completed sessions

async function barDates(url) {
  const res = await fetch(url, {
    headers: { 'APCA-API-KEY-ID': KEY, 'APCA-API-SECRET-KEY': SECRET }
  })
  if (!res.ok) return `HTTP ${res.status} ${await res.text()}`
  const body = await res.json()
  const bars = Object.values(body.bars ?? {})[0] ?? []
  return bars.map((b) => `${b.t}`).join(', ') || '(no bars)'
}

for (const end of ENDS) {
  const common = `timeframe=1Day&start=${START}&end=${end}&limit=10000`
  console.log(`\nend=${end}`)
  console.log(
    '  stock  AAPL :',
    await barDates(`${DATA}/v2/stocks/bars?symbols=AAPL&${common}&feed=sip&adjustment=raw`)
  )
  console.log(
    `  option ${OPTION}:`,
    await barDates(`${DATA}/v1beta1/options/bars?symbols=${OPTION}&${common}`)
  )
}
console.log(
  '\nInclusive ⇔ the last bar listed for each request is stamped on the `end` date (ET midnight = T04:00:00Z in EDT).'
)
