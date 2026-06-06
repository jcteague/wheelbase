#!/usr/bin/env node
// Lightweight probe: can plain HTTPS fetch + cheerio retrieve IVR from Market Chameleon?
// Run: node scripts/test-mc-fetch.mjs [TICKER]
// Example: node scripts/test-mc-fetch.mjs SPY

// Check cheerio is installed
let cheerio
try {
  cheerio = await import('cheerio')
} catch {
  console.error('cheerio not installed — run: pnpm add cheerio')
  process.exit(1)
}

const ticker = (process.argv[2] ?? 'SPY').toUpperCase()
const url = `https://marketchameleon.com/Overview/${ticker}/IV/`
const UA = 'Wheelbase/1.0.0 (+mailto:jcteague@gmail.com)'

console.log(`Fetching: ${url}`)
console.log(`User-Agent: ${UA}\n`)

let response
try {
  response = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(15_000)
  })
} catch (err) {
  console.error('Network error:', err.message)
  process.exit(1)
}

console.log(`HTTP status: ${response.status}`)
console.log(`Content-Type: ${response.headers.get('content-type')}`)

if (!response.ok) {
  console.error(`Non-OK response. Body preview:`)
  const body = await response.text()
  console.log(body.slice(0, 500))
  process.exit(1)
}

const html = await response.text()
console.log(`HTML length: ${html.length} chars\n`)

const $ = cheerio.load(html)

// Print page title to confirm we got the right page
const title = $('title').text().trim()
console.log(`Page title: ${title}\n`)

// Attempt common selector patterns for IV Rank
// These are guesses — update with real selectors after inspecting DevTools
const candidateSelectors = [
  '[data-field="iv_rank"]',
  '.iv-rank',
  '#iv-rank',
  'td:contains("IV Rank")',
  'span.ivrank',
  '.ivRank',
  '[class*="iv_rank"]',
  '[class*="ivRank"]',
  '[class*="iv-rank"]'
]

console.log('--- Selector probe ---')
let found = false
for (const sel of candidateSelectors) {
  try {
    const el = $(sel)
    if (el.length > 0) {
      console.log(`✓ FOUND: ${sel}  →  text: "${el.first().text().trim()}"`)
      found = true
    }
  } catch {
    // invalid selector
  }
}

if (!found) {
  console.log('No candidate selectors matched.\n')
  console.log('--- Text containing "rank" (case-insensitive) ---')
  $('*').each((_, el) => {
    const text = $(el).clone().children().remove().end().text().trim()
    if (/rank/i.test(text) && text.length < 100 && text.length > 0) {
      console.log(`  <${el.tagName} class="${$(el).attr('class') ?? ''}">: "${text}"`)
    }
  })
}

console.log('\n--- First 1000 chars of raw HTML ---')
console.log(html.slice(0, 1000))
