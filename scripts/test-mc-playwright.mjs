#!/usr/bin/env node
// Playwright probe: render Market Chameleon IV page and extract IVR.
// Run: node scripts/test-mc-playwright.mjs [TICKER]

import { chromium } from 'playwright'

const ticker = (process.argv[2] ?? 'SPY').toUpperCase()
const url = `https://marketchameleon.com/Overview/${ticker}/IV/`

console.log(`Launching browser → ${url}\n`)

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
})

const context = await browser.newContext({
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'en-US',
  viewport: { width: 1280, height: 800 },
  extraHTTPHeaders: {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5'
  }
})

const page = await context.newPage()

// Capture XHR/fetch responses containing iv/rank data
const captured = []
page.on('response', async (response) => {
  const reqUrl = response.url()
  if (/iv|rank|summ/i.test(reqUrl) && !reqUrl.includes('.js') && !reqUrl.includes('.css')) {
    try {
      const body = await response.text()
      if (body.length < 50000) {
        captured.push({ url: reqUrl, status: response.status(), body })
      }
    } catch {
      // already consumed
    }
  }
})

try {
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 })
} catch (err) {
  console.error('Navigation error:', err.message)
  await browser.close()
  process.exit(1)
}

// Wait for dynamic content
await page.waitForTimeout(3000)

console.log(`Page title: ${await page.title()}\n`)

// Search for IV Rank in visible text
const allText = await page.evaluate(() => document.body.innerText)
const lines = allText
  .split('\n')
  .filter((l) => /rank|ivr|percentile/i.test(l) && l.trim().length < 100)
if (lines.length) {
  console.log('--- Text lines containing rank/ivr ---')
  lines.forEach((l) => console.log(' ', l.trim()))
}

// Try specific selectors on rendered DOM
const selectorProbes = [
  '#iv_summ',
  '[class*="iv_rank"]',
  '[class*="ivRank"]',
  '[class*="iv-rank"]',
  '.iv_rank_elevated, .iv_rank_moderate, .iv_rank_subdued'
]
console.log('\n--- Selector probe (rendered DOM) ---')
for (const sel of selectorProbes) {
  const text = await page.$eval(sel, (el) => el.textContent?.trim()).catch(() => null)
  const html = await page.$eval(sel, (el) => el.innerHTML?.slice(0, 300)).catch(() => null)
  if (text || html) console.log(`✓ ${sel}\n  text: "${text}"\n  html: ${html}`)
  else console.log(`✗ ${sel}`)
}

// Dump iv_summ full HTML if it exists
const ivSummHtml = await page.$eval('#iv_summ', (el) => el.innerHTML).catch(() => null)
if (ivSummHtml) {
  console.log('\n=== #iv_summ HTML ===')
  console.log(ivSummHtml.slice(0, 2000))
}

// Show captured network responses
if (captured.length) {
  console.log('\n--- Captured network responses ---')
  for (const c of captured) {
    console.log(`\n${c.status} ${c.url}`)
    console.log(c.body.slice(0, 800))
  }
}

await browser.close()
