// [US-46] PollingScheduler — failing tests (Red phase)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarketDataError } from '../integrations/market-data-provider'
import type { MarketStatus, MarketStatusSource } from '../integrations/market-data-provider'
import { logger } from '../logger'
import {
  createPollingScheduler,
  SchedulerError,
  type CadencePolicy,
  type PollingScheduler
} from './polling-scheduler'

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// --- fixtures ---

const MARKET_OPEN: MarketStatus = {
  isOpen: true,
  session: 'regular',
  nextOpen: '2026-01-02T14:30:00Z',
  nextClose: '2026-01-01T21:00:00Z'
}

const MARKET_CLOSED: MarketStatus = {
  isOpen: false,
  session: 'closed',
  nextOpen: '2026-01-02T14:30:00Z',
  nextClose: '2026-01-02T21:00:00Z'
}

const MARKET_EXTENDED: MarketStatus = {
  isOpen: true,
  session: 'pre',
  nextOpen: '2026-01-01T14:30:00Z',
  nextClose: '2026-01-01T21:00:00Z'
}

function makeStatusSource(status: MarketStatus = MARKET_OPEN): MarketStatusSource {
  return { getMarketStatus: vi.fn().mockResolvedValue(status) }
}

function makeStartedScheduler(
  handler: () => Promise<void>,
  options: { marketStatus?: MarketStatus; cadence?: CadencePolicy } = {}
): PollingScheduler {
  const { marketStatus = MARKET_OPEN, cadence = { kind: 'interval', marketOpenMs: 60_000 } } =
    options
  const statusSource = makeStatusSource(marketStatus)
  const scheduler = createPollingScheduler(() => statusSource)
  scheduler.register({ name: 'job', cadence, handler })
  scheduler.start()
  return scheduler
}

// --- tests ---

beforeEach(() => {
  vi.clearAllMocks()
})

describe('register()', () => {
  it('adds a job to the registry without throwing', () => {
    const statusSource = makeStatusSource()
    const scheduler = createPollingScheduler(() => statusSource)
    expect(() => {
      scheduler.register({
        name: 'test-job',
        cadence: { kind: 'interval', marketOpenMs: 60_000 },
        handler: vi.fn().mockResolvedValue(undefined)
      })
    }).not.toThrow()
  })

  it('throws SchedulerError("already_registered") when registering a duplicate job name', () => {
    const statusSource = makeStatusSource()
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'test-job',
      cadence: { kind: 'interval', marketOpenMs: 60_000 },
      handler: vi.fn().mockResolvedValue(undefined)
    })
    expect(() => {
      scheduler.register({
        name: 'test-job',
        cadence: { kind: 'interval', marketOpenMs: 30_000 },
        handler: vi.fn().mockResolvedValue(undefined)
      })
    }).toThrow(SchedulerError)
    try {
      scheduler.register({
        name: 'test-job',
        cadence: { kind: 'interval', marketOpenMs: 30_000 },
        handler: vi.fn().mockResolvedValue(undefined)
      })
    } catch (e) {
      expect((e as SchedulerError).code).toBe('already_registered')
    }
  })
})

describe('runNow() — unknown job', () => {
  it('throws SchedulerError("job_not_found") for an unregistered job name', async () => {
    const statusSource = makeStatusSource()
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.start()
    await expect(scheduler.runNow('ghost')).rejects.toBeInstanceOf(SchedulerError)
    await expect(scheduler.runNow('ghost')).rejects.toMatchObject({ code: 'job_not_found' })
    await scheduler.stop()
  })
})

describe('start() — immediate invocations', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes every registered job handler once immediately on start()', async () => {
    const statusSource = makeStatusSource()
    const scheduler = createPollingScheduler(() => statusSource)
    const handler1 = vi.fn().mockResolvedValue(undefined)
    const handler2 = vi.fn().mockResolvedValue(undefined)

    scheduler.register({
      name: 'job1',
      cadence: { kind: 'interval', marketOpenMs: 60_000 },
      handler: handler1
    })
    scheduler.register({
      name: 'job2',
      cadence: { kind: 'interval', marketOpenMs: 60_000 },
      handler: handler2
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(handler1).toHaveBeenCalledTimes(1)
    expect(handler2).toHaveBeenCalledTimes(1)

    await scheduler.stop()
  })
})

describe('interval cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules subsequent invocations cadenceMs after the previous run finishes', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(handler).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(3)

    await scheduler.stop()
  })

  it('parks interval job when marketClosedMs is null and market is closed', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler, {
      marketStatus: MARKET_CLOSED,
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null }
    })

    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(handler).toHaveBeenCalledTimes(1)

    // Advance 5 minutes — no additional fires because parked
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(handler).toHaveBeenCalledTimes(1)

    await scheduler.stop()
  })

  it('uses extendedHoursMs cadence during pre/post-market sessions', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler, {
      marketStatus: MARKET_EXTENDED, // session: 'pre'
      cadence: { kind: 'interval', marketOpenMs: 60_000, extendedHoursMs: 300_000 }
    })

    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(handler).toHaveBeenCalledTimes(1)

    // 60s should NOT trigger — extended hours cadence is 300s
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(1)

    // Another 240s (total 300s from initial) — should fire
    await vi.advanceTimersByTimeAsync(240_000)
    expect(handler).toHaveBeenCalledTimes(2)

    await scheduler.stop()
  })
})

describe('afterClose cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Set system time to 18:00 — 3 hours before market close at 21:00
    vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires once at nextClose + offsetMinutes', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler, {
      marketStatus: {
        isOpen: true,
        session: 'regular',
        nextOpen: '2026-01-02T14:30:00Z',
        nextClose: '2026-01-01T21:00:00Z'
      },
      cadence: { kind: 'afterClose', offsetMinutes: 30 }
    })

    // Handler should NOT fire immediately
    await vi.advanceTimersByTimeAsync(0)
    expect(handler).not.toHaveBeenCalled()

    // Fire time = 21:00 + 30min = 21:30; delay = 21:30 - 18:00 = 3h30m = 12_600_000ms
    await vi.advanceTimersByTimeAsync(12_600_000 - 1)
    expect(handler).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(handler).toHaveBeenCalledTimes(1)

    await scheduler.stop()
  })

  it('does not backfill an afterClose job missed during app downtime', async () => {
    // nextClose is in the future (today at 21:00, app start is 18:00)
    // The test verifies the handler does NOT fire at startup (it waits for the scheduled time)
    // This is the "no backfill" behavior — only future close times are used
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler, {
      marketStatus: {
        isOpen: true,
        session: 'regular',
        nextOpen: '2026-01-02T14:30:00Z',
        nextClose: '2026-01-01T21:00:00Z'
      },
      cadence: { kind: 'afterClose', offsetMinutes: 30 }
    })

    // Should not fire immediately on startup (no backfill)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(handler).not.toHaveBeenCalled()

    await scheduler.stop()
  })
})

describe('error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('logs WARN when handler throws and reschedules for next cadence without pile-up', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('handler failed'))
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // initial fire (throws)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(vi.mocked(logger.warn)).toHaveBeenCalled()

    // Next cadence fires once
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(2)

    // Only 2 total calls — no exponential pile-up
    expect(handler).toHaveBeenCalledTimes(2)

    await scheduler.stop()
  })
})

describe('runNow()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes the handler immediately and resets the cadence clock to now', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(handler).toHaveBeenCalledTimes(1)

    // Advance 30s (halfway to next scheduled tick)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(handler).toHaveBeenCalledTimes(1)

    // runNow fires immediately
    await scheduler.runNow('job')
    expect(handler).toHaveBeenCalledTimes(2)

    // Cadence clock reset — 30s after runNow should NOT fire
    await vi.advanceTimersByTimeAsync(30_000)
    expect(handler).toHaveBeenCalledTimes(2)

    // 60s from runNow — SHOULD fire
    await vi.advanceTimersByTimeAsync(30_000)
    expect(handler).toHaveBeenCalledTimes(3)

    await scheduler.stop()
  })

  it('joins an in-flight run instead of starting a second concurrent one', async () => {
    // Without the guard, "Refresh IVR now" during the scheduled after-close run
    // starts a second concurrent collection AND leaves two completed reschedules
    // racing to arm timers — from then on the job double-fires every close.
    const resolvers: Array<(value: string) => void> = []
    const handler = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const scheduler = makeStartedScheduler(handler as unknown as () => Promise<void>)

    await vi.advanceTimersByTimeAsync(0) // initial tick fires; run is in flight
    expect(handler).toHaveBeenCalledTimes(1)

    // Manual trigger while the tick's run is still in flight: no second run starts,
    // and the caller receives the in-flight run's result. The joined run keeps the
    // trigger it started with — no second context is ever handed to the handler.
    const joined = scheduler.runNow('job')
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenNthCalledWith(1, { trigger: 'scheduled' })

    resolvers[0]('batch')
    await expect(joined).resolves.toBe('batch')

    // Exactly one next tick was armed — the overlap must not double-fire the cadence.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(2)

    resolvers[1]('second')
    await vi.advanceTimersByTimeAsync(0)
    await scheduler.stop()
  })

  it('returns the registered handler result for ivr-collect callers', async () => {
    const statusSource = makeStatusSource()
    const scheduler = createPollingScheduler(() => statusSource)
    const batch = {
      successCount: 2,
      errorCount: 1,
      skippedCount: 0,
      skippedReason: null
    }
    const handler = vi.fn().mockResolvedValue(batch)

    scheduler.register({
      name: 'ivr-collect',
      cadence: { kind: 'afterClose', offsetMinutes: 60 },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)

    await expect(scheduler.runNow('ivr-collect')).resolves.toEqual(batch)

    await scheduler.stop()
  })
})

describe('stop()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cancels all pending invocations and drains in-flight handler promises', async () => {
    let resolveHandler!: () => void
    const handler = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve
        })
    )
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // fire initial handler
    expect(handler).toHaveBeenCalledTimes(1)

    // Handler is in-flight (not resolved)
    const stopPromise = scheduler.stop()

    // Resolve the in-flight handler
    resolveHandler()
    await stopPromise // should complete

    // No more fires after stop
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('returns control after 5-second drain timeout even if a handler is still hung', async () => {
    const neverResolves = new Promise<void>(() => {}) // never settles
    const handler = vi.fn().mockReturnValue(neverResolves)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // fire initial (hung)
    expect(handler).toHaveBeenCalledTimes(1)

    const stopPromise = scheduler.stop()

    // Advance past the 5s drain timeout
    await vi.advanceTimersByTimeAsync(5_001)

    // stop() must resolve even with a hung handler
    await stopPromise
  })
})

describe('status source is resolved fresh on every reschedule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reschedule uses the latest status source from the getter on every call', async () => {
    const closedSource = makeStatusSource(MARKET_CLOSED)
    const openSource = makeStatusSource(MARKET_OPEN)
    let currentSource: MarketStatusSource = closedSource

    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = createPollingScheduler(() => currentSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0) // initial fire
    expect(handler).toHaveBeenCalledTimes(1)
    expect(closedSource.getMarketStatus).toHaveBeenCalledTimes(1)

    // Job parked because market is closed and marketClosedMs is null
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(1)

    // Swap to an open status source — credentials change at runtime
    currentSource = openSource

    // Manually nudge the scheduler by calling runNow (mirrors what would happen if a
    // settings change triggered a re-tick). The point is: reschedule() inside this call
    // must hit the NEW status source, not the cached closed one.
    await scheduler.runNow('job')
    expect(handler).toHaveBeenCalledTimes(2)
    expect(openSource.getMarketStatus).toHaveBeenCalledTimes(1)

    // Next cadence (60s) fires because the new status source reports market open
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(3)
    expect(openSource.getMarketStatus).toHaveBeenCalledTimes(2)

    await scheduler.stop()
  })

  it('startAfterClose uses the latest status source from the getter', async () => {
    vi.setSystemTime(new Date('2026-01-01T18:00:00Z'))

    const initialSource = makeStatusSource({
      isOpen: true,
      session: 'regular',
      nextOpen: '2026-01-02T14:30:00Z',
      nextClose: '2026-01-01T21:00:00Z'
    })
    const swappedSource = makeStatusSource({
      isOpen: true,
      session: 'regular',
      nextOpen: '2026-01-02T14:30:00Z',
      nextClose: '2026-01-01T22:00:00Z' // 1 hour later
    })
    let currentSource: MarketStatusSource = initialSource

    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = createPollingScheduler(() => currentSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'afterClose', offsetMinutes: 30 },
      handler
    })

    // Swap the source BEFORE start — start() should call startAfterClose which must use
    // the swapped source, not anything captured at construction.
    currentSource = swappedSource

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)

    expect(swappedSource.getMarketStatus).toHaveBeenCalledTimes(1)
    expect(initialSource.getMarketStatus).not.toHaveBeenCalled()

    // Fire time = 22:00 + 30min = 22:30; delay from 18:00 = 4h30m = 16_200_000ms
    await vi.advanceTimersByTimeAsync(16_200_000 - 1)
    expect(handler).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(handler).toHaveBeenCalledTimes(1)

    await scheduler.stop()
  })
})

describe('stop() — timeout cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears the drain-fallback timeout when in-flight handlers drain first', async () => {
    let resolveHandler!: () => void
    const handler = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHandler = resolve
        })
    )
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // fire initial handler
    expect(handler).toHaveBeenCalledTimes(1)

    const stopPromise = scheduler.stop()
    resolveHandler()
    await stopPromise

    // After drain wins, no pending timers should remain — particularly not the 5s
    // fallback timeout that previously was never cleared.
    expect(vi.getTimerCount()).toBe(0)
  })

  it('falls back to the 5-second timeout when drain stalls and fires the timeout only once', async () => {
    const neverResolves = new Promise<void>(() => {})
    const handler = vi.fn().mockReturnValue(neverResolves)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0) // fire initial (hung)
    expect(handler).toHaveBeenCalledTimes(1)

    const stopPromise = scheduler.stop()

    // Advance to just before timeout
    await vi.advanceTimersByTimeAsync(4_999)

    // Cross the boundary
    await vi.advanceTimersByTimeAsync(2)
    await stopPromise

    // No further timer callbacks should be queued after stop resolves
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('parked-job self-resume (US-49)', () => {
  const FAKE_NOW = '2026-01-01T10:00:00Z'
  const NEXT_OPEN = '2026-01-02T14:30:00Z'
  const WAKE_DELAY_MS = new Date(NEXT_OPEN).getTime() - new Date(FAKE_NOW).getTime()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(FAKE_NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('schedules a wake timer at nextOpen when market is closed and marketClosedMs is null', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const statusSource = makeStatusSource(MARKET_CLOSED)
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)

    expect(vi.getTimerCount()).toBe(1)

    await scheduler.stop()
  })

  it('logs INFO when parking a job until nextOpen', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const statusSource = makeStatusSource(MARKET_CLOSED)
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'job', nextOpen: NEXT_OPEN }),
      expect.stringMatching(/parked until next market open/)
    )

    await scheduler.stop()
  })

  it('job resumes marketOpenMs cadence when wake fires and market is open', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const closedSource = makeStatusSource(MARKET_CLOSED)
    const openSource = makeStatusSource(MARKET_OPEN)
    let currentSource: MarketStatusSource = closedSource

    const scheduler = createPollingScheduler(() => currentSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(handler).toHaveBeenCalledTimes(1)

    currentSource = openSource
    await vi.advanceTimersByTimeAsync(WAKE_DELAY_MS)
    expect(handler).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(3)

    await scheduler.stop()
  })

  it('job resumes extendedHoursMs cadence when wake fires during pre-market', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const closedSource = makeStatusSource(MARKET_CLOSED)
    const extendedSource = makeStatusSource(MARKET_EXTENDED)
    let currentSource: MarketStatusSource = closedSource

    const scheduler = createPollingScheduler(() => currentSource)
    scheduler.register({
      name: 'job',
      cadence: {
        kind: 'interval',
        marketOpenMs: 60_000,
        extendedHoursMs: 300_000,
        marketClosedMs: null
      },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(handler).toHaveBeenCalledTimes(1)

    currentSource = extendedSource
    await vi.advanceTimersByTimeAsync(WAKE_DELAY_MS)
    expect(handler).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(240_000)
    expect(handler).toHaveBeenCalledTimes(3)

    await scheduler.stop()
  })

  it('launching after hours parks the job with exactly one timer pending', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const statusSource = makeStatusSource(MARKET_CLOSED)
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)

    expect(vi.getTimerCount()).toBe(1)

    await scheduler.stop()
  })

  it('stop() clears the park-wake timer', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const statusSource = makeStatusSource(MARKET_CLOSED)
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)

    await scheduler.stop()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stale nextOpen in the past falls back to marketOpenMs and logs WARN', async () => {
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'))

    const handler = vi.fn().mockResolvedValue(undefined)
    const statusSource = makeStatusSource(MARKET_CLOSED)
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)

    expect(vi.getTimerCount()).toBe(1)
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'job' }),
      expect.stringMatching(/nextOpen.*unusable/)
    )

    await scheduler.stop()
  })
})

describe('system wake from sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not fire a burst of missed ticks after a large time jump; next tick is from now forward', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler)

    // Initial fire
    await vi.advanceTimersByTimeAsync(0)
    expect(handler).toHaveBeenCalledTimes(1)

    // Simulate system sleep: jump the system clock forward 2 hours
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000)

    // Fire ONLY the one currently-pending timer (not new timers created by callbacks).
    // A burst implementation would have many pending timers here; with setTimeout chains
    // there is exactly one, so only one additional call happens.
    await vi.runOnlyPendingTimersAsync()
    expect(handler).toHaveBeenCalledTimes(2)

    // Next timer was rescheduled from "now" — one more cadence fires, no burst
    await vi.runOnlyPendingTimersAsync()
    expect(handler).toHaveBeenCalledTimes(3)

    await scheduler.stop()
  })
})

// [US-116] The scheduler asks the market-data port for the session, and an outage there
// must not stop an interval job ticking.
describe('a failing status source falls back to the default cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps an interval job on marketOpenMs when getMarketStatus rejects', async () => {
    const statusSource: MarketStatusSource = {
      getMarketStatus: vi.fn().mockRejectedValue(new MarketDataError('network_error', 'offline'))
    }
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = createPollingScheduler(() => statusSource)
    scheduler.register({
      name: 'job',
      cadence: { kind: 'interval', marketOpenMs: 60_000, marketClosedMs: null },
      handler
    })
    scheduler.start()

    await vi.advanceTimersByTimeAsync(0)
    expect(handler).toHaveBeenCalledTimes(1)

    // Without the fallback the job would park forever on a transient outage.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'job' }),
      expect.stringContaining('falling back to default cadence')
    )

    await scheduler.stop()
  })
})

describe('runNow() — run trigger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tells the handler a timer tick was scheduled', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0)

    expect(handler).toHaveBeenCalledWith({ trigger: 'scheduled' })

    await scheduler.stop()
  })

  it('tells the handler a bare runNow was explicit', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0)
    await scheduler.runNow('job')

    expect(handler).toHaveBeenNthCalledWith(2, { trigger: 'explicit' })

    await scheduler.stop()
  })

  it('lets a caller drive a run as if the timer had fired', async () => {
    const handler = vi.fn().mockResolvedValue(undefined)
    const scheduler = makeStartedScheduler(handler)

    await vi.advanceTimersByTimeAsync(0)
    await scheduler.runNow('job', { trigger: 'scheduled' })

    expect(handler).toHaveBeenNthCalledWith(2, { trigger: 'scheduled' })

    await scheduler.stop()
  })
})
