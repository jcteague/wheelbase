/* eslint-disable @typescript-eslint/explicit-function-return-type -- throwaway spike, plain JS */
// Spike for US-121 / OPT-27: can Alpaca option bars support a self-computed IV30 history?
//
// For each ticker over the last 52 weeks it:
//   1. loads the exchange calendar and the underlying's daily bars (sessions + closes)
//   2. constructs OCC symbols for ATM call/put at the two Friday expirations bracketing 30 DTE
//   3. fetches DAILY option bars (100 symbols/call), measures coverage + cost, computes IV30 from VWAP
//   4. fetches 1-MINUTE option bars in the last 15 min before each session's real close,
//      measures coverage + staleness, computes IV30 from the last print paired with the stock minute
//   5. compares the two IV30 series and the IV rank each yields
//
// Usage: node scripts/spike-iv-history.mjs [TICKER ...]   (defaults: AAPL MSFT NVDA SPY)
//        env SKIP_MINUTE=1 skips step 4.

import fs from 'node:fs'
import path from 'node:path'

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const HEADERS = {
  'APCA-API-KEY-ID': env.MAIN_VITE_ALPACA_KEY_ID,
  'APCA-API-SECRET-KEY': env.MAIN_VITE_ALPACA_SECRET_KEY
}
const DATA = 'https://data.alpaca.markets'
const TRADING = 'https://paper-api.alpaca.markets'

const TICKERS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['AAPL', 'MSFT', 'NVDA', 'SPY']
const RATE = 0.045 // stated risk-free rate
const MIN_TRADES = Number(process.env.MIN_TRADES ?? 5) // liquidity gate on daily bar trade count
const MONTHLY_FALLBACK = !!process.env.MONTHLY_FALLBACK // try 3rd-Friday monthlies when the weekly pair fails
const NEAR_CLOSE_MIN = 15 // minute-bar window before close
const OUT_DIR = process.env.SPIKE_OUT ?? 'scratch-spike-out'

// ---------------------------------------------------------------- HTTP with counters
const stats = { requests: 0, pages: 0, retries: 0 }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url) {
  for (let attempt = 0; ; attempt++) {
    stats.requests++
    const r = await fetch(url, { headers: HEADERS })
    if (r.status === 429 && attempt < 6) {
      stats.retries++
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (!r.ok) throw new Error(`${r.status} ${url}\n${await r.text()}`)
    return r.json()
  }
}
// follows next_page_token; merges `key` maps (symbol -> array)
async function getAll(url, key) {
  const out = {}
  let token
  do {
    const json = await get(token ? `${url}&page_token=${encodeURIComponent(token)}` : url)
    stats.pages++
    for (const [sym, arr] of Object.entries(json[key] ?? {})) (out[sym] ??= []).push(...arr)
    token = json.next_page_token
  } while (token)
  return out
}

// ---------------------------------------------------------------- dates
const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}
const dow = (s) => new Date(s + 'T00:00:00Z').getUTCDay()
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000)

// ---------------------------------------------------------------- OCC symbols
const occ = (root, exp, cp, strike) =>
  `${root}${exp.slice(2).replace(/-/g, '')}${cp}${String(Math.round(strike * 1000)).padStart(8, '0')}`

// candidate ATM strikes at several grid increments, nearest first
function strikeCandidates(S) {
  const set = new Set()
  for (const inc of [1, 2.5, 5, 0.5]) {
    set.add(Math.floor(S / inc) * inc)
    set.add(Math.ceil(S / inc) * inc)
  }
  return [...set].map((k) => +k.toFixed(2)).sort((a, b) => Math.abs(a - S) - Math.abs(b - S))
}

// two Friday expirations bracketing D+30; a Friday holiday shifts to the prior session
function bracketExpirations(session, sessionSet) {
  const target = addDays(session, 30)
  let f = target
  while (dow(f) !== 5) f = addDays(f, -1)
  let lo = f
  let hi = addDays(f, 7)
  if (lo === target) hi = null // exactly 30 DTE: single expiry
  const fix = (e) => {
    if (!e) return null
    let x = e
    while (!sessionSet.has(x) && daysBetween(session, x) > 0) x = addDays(x, -1)
    return x
  }
  return { lo: fix(lo), hi: fix(hi) }
}

// 3rd-Friday monthlies bracketing D+30 (lo must be >= 7 DTE, else shift out one month)
function thirdFriday(y, m) {
  const d = new Date(Date.UTC(y, m, 1))
  let c = 0
  while (d.getUTCDay() !== 5 || ++c < 3) d.setUTCDate(d.getUTCDate() + 1)
  return iso(d)
}
function monthlyBracket(session, sessionSet) {
  const [y, m] = session.split('-').map(Number)
  const ms = [-1, 0, 1, 2, 3].map((k) => thirdFriday(y, m - 1 + k))
  const target = addDays(session, 30)
  const usable = ms.filter((e) => daysBetween(session, e) >= 7)
  let lo = [...usable].reverse().find((e) => e <= target)
  let hi = usable.find((e) => e > target)
  if (!lo) {
    lo = hi
    hi = usable[usable.indexOf(hi) + 1]
  }
  const fix = (e) => {
    if (!e) return null
    let x = e
    while (!sessionSet.has(x) && daysBetween(session, x) > 0) x = addDays(x, -1)
    return x
  }
  return { mlo: fix(lo), mhi: fix(hi) }
}

// ---------------------------------------------------------------- Black-Scholes
const ncdf = (x) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989423 * Math.exp((-x * x) / 2)
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return x > 0 ? 1 - p : p
}
function bsPrice(cp, S, K, T, r, sigma) {
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T))
  const d2 = d1 - sigma * Math.sqrt(T)
  return cp === 'C'
    ? S * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2)
    : K * Math.exp(-r * T) * ncdf(-d2) - S * ncdf(-d1)
}
function impliedVol(cp, price, S, K, T, r) {
  const intrinsic =
    cp === 'C' ? Math.max(0, S - K * Math.exp(-r * T)) : Math.max(0, K * Math.exp(-r * T) - S)
  if (price <= intrinsic) return null
  let lo = 0.01
  let hi = 5
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (bsPrice(cp, S, K, T, r, mid) > price) hi = mid
    else lo = mid
  }
  return (lo + hi) / 2
}
// legs: [{cp, price, K, T}] for one expiry -> average IV of call+put, or null
function expiryIv(legs, S) {
  const ivs = legs.map((l) => impliedVol(l.cp, l.price, S, l.K, l.T, RATE)).filter((v) => v != null)
  return ivs.length === legs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null
}
// total-variance interpolation to 30 days
function iv30(lo, hi) {
  if (lo && !hi) return lo.iv
  if (!lo || !hi) return null
  const T30 = 30 / 365
  const w = (T30 - lo.T) / (hi.T - lo.T)
  const v = lo.iv ** 2 * lo.T * (1 - w) + hi.iv ** 2 * hi.T * w
  return Math.sqrt(v / T30)
}
function rankStats(series) {
  const vals = series.map((s) => s.iv).filter((v) => v != null)
  if (vals.length < 2) return null
  const today = vals[vals.length - 1]
  const hist = vals.slice(0, -1)
  const min = Math.min(...hist)
  const max = Math.max(...hist)
  const rank = max === min ? null : ((today - min) / (max - min)) * 100
  const pct = (hist.filter((v) => v < today).length / hist.length) * 100
  return { n: vals.length, today, min, max, rank, pct }
}

// ---------------------------------------------------------------- calendar + underlying
async function loadCalendar(start, end) {
  const cal = await get(`${TRADING}/v2/calendar?start=${start}&end=${end}`)
  // cal[i] = {date, open:'09:30', close:'16:00'}; close is ET wall time
  return new Map(cal.map((c) => [c.date, c]))
}
// ET wall-clock -> UTC instant, DST-aware
function etToUtc(date, hm) {
  const [h, m] = hm.split(':').map(Number)
  const guess = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const etHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false
    }).format(guess)
  )
  const offset = (h - etHour + 24) % 24 // 4 or 5
  return new Date(guess.getTime() + offset * 3600_000)
}

async function loadStockDaily(sym, start, end) {
  const bars = await getAll(
    `${DATA}/v2/stocks/bars?symbols=${sym}&timeframe=1Day&start=${start}&end=${end}&feed=iex&limit=10000&adjustment=raw`,
    'bars'
  )
  return new Map((bars[sym] ?? []).map((b) => [b.t.slice(0, 10), b]))
}
async function loadStockMinutes(sym, start, end) {
  const bars = await getAll(
    `${DATA}/v2/stocks/bars?symbols=${sym}&timeframe=1Min&start=${start}&end=${end}&feed=iex&limit=10000&adjustment=raw`,
    'bars'
  )
  return new Map((bars[sym] ?? []).map((b) => [b.t, b]))
}

// ---------------------------------------------------------------- main per ticker
async function runTicker(root, start, end, calendar) {
  const t0 = Date.now()
  const before = { ...stats }
  const sessionSet = new Set([...calendar.keys()])
  const stock = await loadStockDaily(root, start, end)
  const sessions = [...stock.keys()].filter((d) => d >= start && d <= end).sort()

  // --- plan legs per session
  const plan = sessions.map((d) => {
    const S = stock.get(d).c
    const { lo, hi } = bracketExpirations(d, sessionSet)
    const { mlo, mhi } = MONTHLY_FALLBACK ? monthlyBracket(d, sessionSet) : {}
    const strikes = strikeCandidates(S)
    const legsFor = (exp) =>
      exp
        ? strikes.flatMap((K) =>
            ['C', 'P'].map((cp) => ({ exp, K, cp, sym: occ(root, exp, cp, K) }))
          )
        : []
    return {
      d,
      S,
      lo,
      hi,
      mlo,
      mhi,
      cands: { lo: legsFor(lo), hi: legsFor(hi), mlo: legsFor(mlo), mhi: legsFor(mhi) }
    }
  })
  const allSyms = [
    ...new Set(
      plan.flatMap((p) =>
        [...p.cands.lo, ...p.cands.hi, ...p.cands.mlo, ...p.cands.mhi].map((l) => l.sym)
      )
    )
  ]

  // --- fetch daily option bars in 100-symbol batches
  const dailyBars = {}
  for (let i = 0; i < allSyms.length; i += 100) {
    const batch = allSyms.slice(i, i + 100)
    const res = await getAll(
      `${DATA}/v1beta1/options/bars?symbols=${batch.join(',')}&timeframe=1Day&start=${start}&end=${end}&limit=10000`,
      'bars'
    )
    for (const [sym, arr] of Object.entries(res))
      dailyBars[sym] = new Map(arr.map((b) => [b.t.slice(0, 10), b]))
  }
  const symsWithData = Object.keys(dailyBars).length

  // pick the nearest strike whose call AND put both have a daily bar on d passing the trade gate
  function pickDaily(p, side) {
    const byK = new Map()
    for (const l of p.cands[side]) (byK.get(l.K) ?? byK.set(l.K, []).get(l.K)).push(l)
    for (const [K, legs] of byK) {
      const bars = legs.map((l) => dailyBars[l.sym]?.get(p.d))
      if (bars.every((b) => b && b.n >= MIN_TRADES)) return { K, legs, bars, exp: legs[0].exp }
      // remember the best partial for diagnostics
    }
    return null
  }
  const dailySeries = []
  const dailyDiag = {
    full: 0,
    partial: 0,
    none: 0,
    inversionFail: 0,
    strikeIdx: [],
    nSum: 0,
    nCount: 0,
    viaMonthly: 0
  }
  for (const p of plan) {
    let lo = pickDaily(p, 'lo')
    let hi = p.hi ? pickDaily(p, 'hi') : null
    let need = p.hi ? 2 : 1
    let got = (lo ? 1 : 0) + (hi ? 1 : 0)
    let src = 'w'
    if (got !== need && MONTHLY_FALLBACK && p.mlo) {
      const mlo = pickDaily(p, 'mlo')
      const mhi = p.mhi ? pickDaily(p, 'mhi') : null
      const mneed = p.mhi ? 2 : 1
      const mgot = (mlo ? 1 : 0) + (mhi ? 1 : 0)
      if (mgot === mneed) {
        lo = mlo
        hi = mhi
        need = mneed
        got = mgot
        src = 'm'
        dailyDiag.viaMonthly++
      }
    }
    if (got === need) dailyDiag.full++
    else if (got > 0) dailyDiag.partial++
    else dailyDiag.none++
    const Sv = stock.get(p.d).vw ?? p.S
    const toExp = (pick) => {
      if (!pick) return null
      for (const b of pick.bars) {
        dailyDiag.nSum += b.n
        dailyDiag.nCount++
      }
      const T = daysBetween(p.d, pick.exp) / 365
      const legs = pick.legs.map((l, i) => ({ cp: l.cp, K: l.K, T, price: pick.bars[i].vw }))
      const iv = expiryIv(legs, Sv)
      return iv == null ? null : { iv, T }
    }
    const loE = toExp(lo)
    const hiE = toExp(hi)
    if ((lo && !loE) || (hi && !hiE)) dailyDiag.inversionFail++
    const iv = got === need ? iv30(loE, hi ? hiE : null) : null
    dailySeries.push({ d: p.d, iv, K: lo?.K, exp: lo?.exp, hiExp: hi?.exp, src })
  }

  const afterDaily = { ...stats }
  const dailyCost = {
    requests: afterDaily.requests - before.requests,
    pages: afterDaily.pages - before.pages,
    seconds: ((Date.now() - t0) / 1000).toFixed(1),
    symbolsProbed: allSyms.length,
    symbolsWithData: symsWithData
  }

  // --- near-close minute bars
  let minuteSeries = []
  let minuteDiag = null
  let minuteCost = null
  if (!process.env.SKIP_MINUTE) {
    const t1 = Date.now()
    const beforeM = { ...stats }
    const stockMin = await loadStockMinutes(root, `${start}T00:00:00Z`, `${end}T23:59:59Z`)
    minuteDiag = {
      full: 0,
      partial: 0,
      none: 0,
      staleness: [],
      pairGap: [],
      stockMinuteMissing: 0,
      inversionFail: 0
    }
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i]
      const closeUtc = etToUtc(p.d, calendar.get(p.d)?.close ?? '16:00')
      const winStart = new Date(closeUtc.getTime() - NEAR_CLOSE_MIN * 60_000)
      // use the strikes the daily pass selected (fall back to nearest candidate)
      const dLo = dailySeries[i]
      const pickLegs = (side, K) =>
        K != null ? p.cands[side].filter((l) => l.K === K) : p.cands[side].slice(0, 2)
      // for the hi expiry choose the same strike as lo if it was picked, else nearest candidate
      const hiK = dLo.K ?? p.cands.hi[0]?.K
      const legsFinal = [
        ...pickLegs('lo', dLo.K ?? p.cands.lo[0]?.K),
        ...(p.hi ? pickLegs('hi', hiK) : [])
      ]
      if (!legsFinal.length) {
        minuteDiag.none++
        minuteSeries.push({ d: p.d, iv: null })
        continue
      }
      const res = await getAll(
        `${DATA}/v1beta1/options/bars?symbols=${legsFinal.map((l) => l.sym).join(',')}&timeframe=1Min&start=${winStart.toISOString()}&end=${closeUtc.toISOString()}&limit=10000`,
        'bars'
      )
      const last = legsFinal.map((l) => {
        const arr = res[l.sym] ?? []
        return arr.length ? { leg: l, bar: arr[arr.length - 1] } : null
      })
      const got = last.filter(Boolean).length
      if (got === legsFinal.length) minuteDiag.full++
      else if (got > 0) minuteDiag.partial++
      else minuteDiag.none++
      for (const x of last.filter(Boolean))
        minuteDiag.staleness.push((closeUtc - new Date(x.bar.t)) / 60_000)
      // pair gap between call and put last-bar minutes per expiry
      for (const exp of [p.lo, p.hi].filter(Boolean)) {
        const pair = last.filter((x) => x && x.leg.exp === exp)
        if (pair.length === 2)
          minuteDiag.pairGap.push(
            Math.abs(new Date(pair[0].bar.t) - new Date(pair[1].bar.t)) / 60_000
          )
      }
      if (got !== legsFinal.length) {
        minuteSeries.push({ d: p.d, iv: null })
        continue
      }
      // underlying price: stock minute bar at the latest option bar minute (or nearest earlier)
      const latestT = last
        .map((x) => x.bar.t)
        .sort()
        .at(-1)
      let sBar = stockMin.get(latestT)
      if (!sBar) {
        for (let m = 1; m <= NEAR_CLOSE_MIN && !sBar; m++)
          sBar = stockMin.get(
            new Date(new Date(latestT).getTime() - m * 60_000).toISOString().replace('.000Z', 'Z')
          )
      }
      if (!sBar) {
        minuteDiag.stockMinuteMissing++
        minuteSeries.push({ d: p.d, iv: null })
        continue
      }
      const perExp = (exp) => {
        const pair = last.filter((x) => x.leg.exp === exp)
        if (pair.length !== 2) return null
        const T = daysBetween(p.d, exp) / 365
        const iv = expiryIv(
          pair.map((x) => ({ cp: x.leg.cp, K: x.leg.K, T, price: x.bar.c })),
          sBar.c
        )
        return iv == null ? null : { iv, T }
      }
      const loE = perExp(p.lo)
      const hiE = p.hi ? perExp(p.hi) : null
      if (!loE || (p.hi && !hiE)) minuteDiag.inversionFail++
      minuteSeries.push({ d: p.d, iv: iv30(loE, p.hi ? hiE : null) })
    }
    minuteCost = {
      requests: stats.requests - beforeM.requests,
      pages: stats.pages - beforeM.pages,
      seconds: ((Date.now() - t1) / 1000).toFixed(1)
    }
  }

  return {
    root,
    sessions: sessions.length,
    dailySeries,
    dailyDiag,
    dailyCost,
    minuteSeries,
    minuteDiag,
    minuteCost
  }
}

// ---------------------------------------------------------------- report
const median = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null)
const pctl = (a, q) =>
  a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : null
const f1 = (x) => (x == null ? 'n/a' : (+x).toFixed(1))
const f3 = (x) => (x == null ? 'n/a' : (+x).toFixed(3))

function corr(a, b) {
  const pairs = a.map((x, i) => [x.iv, b[i]?.iv]).filter(([x, y]) => x != null && y != null)
  if (pairs.length < 3) return null
  const mx = pairs.reduce((s, [x]) => s + x, 0) / pairs.length
  const my = pairs.reduce((s, [, y]) => s + y, 0) / pairs.length
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  return {
    n: pairs.length,
    r: sxy / Math.sqrt(sxx * syy),
    meanAbsDiff: pairs.reduce((s, [x, y]) => s + Math.abs(x - y), 0) / pairs.length
  }
}

function report(r) {
  const dr = rankStats(r.dailySeries)
  const mr = r.minuteSeries.length ? rankStats(r.minuteSeries) : null
  const dd = r.dailyDiag
  const md = r.minuteDiag
  const lines = []
  lines.push(`\n=== ${r.root} — ${r.sessions} sessions ===`)
  lines.push(
    `DAILY bars: full ${dd.full} / partial ${dd.partial} / none ${dd.none}; inversion failures ${dd.inversionFail}; via monthlies ${dd.viaMonthly}; mean trades per bar ${f1(dd.nCount ? dd.nSum / dd.nCount : null)}`
  )
  lines.push(
    `  cost: ${r.dailyCost.requests} requests, ${r.dailyCost.pages} pages, ${r.dailyCost.seconds}s; ${r.dailyCost.symbolsProbed} symbols probed, ${r.dailyCost.symbolsWithData} had data`
  )
  lines.push(
    `  IV30: n=${dr?.n ?? 0} today=${f3(dr?.today)} min=${f3(dr?.min)} max=${f3(dr?.max)} rank=${f1(dr?.rank)} pctl=${f1(dr?.pct)}`
  )
  if (md) {
    lines.push(
      `MINUTE bars (last ${NEAR_CLOSE_MIN} min): full ${md.full} / partial ${md.partial} / none ${md.none}; stock-minute missing ${md.stockMinuteMissing}; inversion failures ${md.inversionFail}`
    )
    lines.push(
      `  staleness (min before close): median ${f1(median(md.staleness))}, p90 ${f1(pctl(md.staleness, 0.9))}; call/put pair gap median ${f1(median(md.pairGap))} p90 ${f1(pctl(md.pairGap, 0.9))}`
    )
    lines.push(
      `  cost: ${r.minuteCost.requests} requests, ${r.minuteCost.pages} pages, ${r.minuteCost.seconds}s`
    )
    lines.push(
      `  IV30: n=${mr?.n ?? 0} today=${f3(mr?.today)} min=${f3(mr?.min)} max=${f3(mr?.max)} rank=${f1(mr?.rank)} pctl=${f1(mr?.pct)}`
    )
    const c = corr(r.dailySeries, r.minuteSeries)
    if (c)
      lines.push(
        `  daily vs minute IV30: n=${c.n} corr=${f3(c.r)} meanAbsDiff=${f3(c.meanAbsDiff)} rankDiff=${f1(dr && mr && dr.rank != null && mr.rank != null ? dr.rank - mr.rank : null)}`
      )
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------- run
const end = iso(new Date(Date.now() - 86400000)) // through yesterday
const start = addDays(end, -364)
fs.mkdirSync(OUT_DIR, { recursive: true })
console.log(
  `window ${start} .. ${end}; tickers ${TICKERS.join(' ')}; rate ${RATE}; trade gate ${MIN_TRADES}; monthly fallback ${MONTHLY_FALLBACK}`
)
const calendar = await loadCalendar(start, addDays(end, 60))
const results = []
for (const t of TICKERS) {
  try {
    const r = await runTicker(t, start, end, calendar)
    results.push(r)
    console.log(report(r))
    fs.writeFileSync(path.join(OUT_DIR, `${t}.json`), JSON.stringify(r, null, 1))
  } catch (e) {
    console.error(`${t} failed:`, e.message)
  }
}
console.log(
  `\nTOTAL requests ${stats.requests}, pages ${stats.pages}, 429 retries ${stats.retries}`
)
