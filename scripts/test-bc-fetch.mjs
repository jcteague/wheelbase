#!/usr/bin/env node
// Probe: verify Barchart IVR API returns data for a given ticker.
// Run: node scripts/test-bc-fetch.mjs [TICKER]
// Example: node scripts/test-bc-fetch.mjs SPY

const ticker = (process.argv[2] ?? 'SPY').toUpperCase()
const UA = 'Wheelbase/1.0.0 (+mailto:jcteague@gmail.com)'

console.log(`Ticker: ${ticker}`)
console.log(`User-Agent: ${UA}\n`)

// Step 1: acquire session cookies + XSRF token
console.log('Step 1: acquiring session...')
let sessionResponse
try {
  sessionResponse = await fetch('https://www.barchart.com/stocks/quotes/SPY/options', {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(15_000)
  })
} catch (err) {
  console.error('Session fetch failed:', err.message)
  process.exit(1)
}

const setCookieHeaders = sessionResponse.headers.getSetCookie()
const cookies = setCookieHeaders.map((c) => c.split(';')[0]).join('; ')
const xsrfRaw =
  setCookieHeaders.find((c) => c.startsWith('XSRF-TOKEN'))?.match(/XSRF-TOKEN=([^;]+)/)?.[1] ?? ''
const xsrf = decodeURIComponent(xsrfRaw)

console.log(`Session status: ${sessionResponse.status}`)
console.log(`Cookies: ${cookies.slice(0, 80)}...`)
console.log(`XSRF token: ${xsrf.slice(0, 20)}...\n`)

// Step 2: call the IVR API
const fields =
  'baseSymbol,impliedVolatilityRank1y,impliedVolatilityPercentile1y,historicVolatility20d'
const url = `https://www.barchart.com/proxies/core-api/v1/options/get?baseSymbol=${ticker}&fields=${fields}&limit=1&raw=1`

console.log(`Step 2: calling API...`)
console.log(`URL: ${url}\n`)

let apiResponse
try {
  apiResponse = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json, text/plain, */*',
      'X-XSRF-TOKEN': xsrf,
      Cookie: cookies,
      Referer: 'https://www.barchart.com/stocks/quotes/SPY/options'
    },
    signal: AbortSignal.timeout(10_000)
  })
} catch (err) {
  console.error('API fetch failed:', err.message)
  process.exit(1)
}

console.log(`API status: ${apiResponse.status}`)
const body = await apiResponse.json()
console.log(`count: ${body.count}`)

if (body.count === 0) {
  console.log(`\nResult: not_available — no options data for ${ticker}`)
  process.exit(0)
}

const raw = body.data?.[0]?.raw ?? {}
console.log('\nRaw fields:')
console.log(`  impliedVolatilityRank1y:    ${raw.impliedVolatilityRank1y}`)
console.log(`  impliedVolatilityPercentile1y: ${raw.impliedVolatilityPercentile1y}`)
console.log(`  historicVolatility20d:      ${raw.historicVolatility20d}`)

if (typeof raw.impliedVolatilityRank1y !== 'number') {
  console.log('\nResult: parse_error — impliedVolatilityRank1y missing or non-numeric')
  process.exit(1)
}

const ivr = Math.round(raw.impliedVolatilityRank1y * 10) / 10
const ivp =
  typeof raw.impliedVolatilityPercentile1y === 'number'
    ? Math.round(raw.impliedVolatilityPercentile1y * 1000) / 10
    : undefined

console.log('\n✓ Result: ok')
console.log(`  ticker:      ${ticker}`)
console.log(`  ivr:         ${ivr}%`)
console.log(`  ivp:         ${ivp !== undefined ? ivp + '%' : 'N/A'}`)
console.log(`  iv30:        ${raw.historicVolatility20d ?? 'N/A'}%`)
console.log(`  source:      barchart`)
console.log(`  observedAt:  ${new Date().toISOString()}`)
