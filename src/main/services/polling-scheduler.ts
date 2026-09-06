import type { BrokerProvider, MarketStatus } from '../integrations/broker-provider'
import { logger } from '../logger'

export type CadencePolicy =
  | {
      kind: 'interval'
      marketOpenMs: number
      extendedHoursMs?: number
      marketClosedMs?: number | null
    }
  | { kind: 'afterClose'; offsetMinutes: number }

export type JobHandler = () => Promise<unknown>

export type JobConfig = {
  name: string
  cadence: CadencePolicy
  handler: JobHandler
}

export type JobRegistryEntry = {
  name: string
  cadence: CadencePolicy
  invocations: number
}

export interface PollingScheduler {
  register(config: JobConfig): void
  start(): void
  stop(): Promise<void>
  runNow(jobName: string): Promise<unknown>
  getRegistry(): JobRegistryEntry[]
}

export class SchedulerError extends Error {
  readonly code: 'already_registered' | 'job_not_found' | 'not_started'

  constructor(code: SchedulerError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'SchedulerError'
  }
}

// Pure helpers

export function decideNextCadenceMs(policy: CadencePolicy, status: MarketStatus): number | null {
  if (policy.kind === 'afterClose') return null

  switch (status.session) {
    case 'regular':
      return policy.marketOpenMs
    case 'pre':
    case 'post':
      return policy.extendedHoursMs ?? policy.marketOpenMs
    case 'closed':
      if (policy.marketClosedMs === null) return null
      return policy.marketClosedMs ?? policy.marketOpenMs
  }
}

export function decideAfterCloseFireAt(
  nextClose: string,
  offsetMinutes: number,
  nowMs: number
): number | null {
  const fireAt = new Date(nextClose).getTime() + offsetMinutes * 60_000
  return fireAt > nowMs ? fireAt : null
}

// Clock boundary for testability

type TimerId = ReturnType<typeof setTimeout>

type Clock = {
  now(): number
  setTimeout(fn: () => void, ms: number): TimerId
  clearTimeout(id: TimerId): void
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id)
}

type JobState = {
  config: JobConfig
  timerId: TimerId | null
  invocations: number
  /** The in-flight handler promise, or null when idle. A scheduled tick firing while
   *  a run is in flight is skipped, and runNow() joins the run instead of starting a
   *  concurrent one — overlapping runs would double-hit the provider and leave two
   *  live reschedules racing to arm timers. */
  running: Promise<unknown> | null
}

/**
 * Creates a polling scheduler bound to a broker getter rather than a broker
 * instance. The broker is resolved fresh on every reschedule so that runtime
 * credential changes (Settings page → brokerFactory.recreate()) take effect on
 * the next tick without an app restart.
 */
export function createPollingScheduler(
  getBroker: () => BrokerProvider,
  clock: Clock = realClock
): PollingScheduler {
  const jobs = new Map<string, JobState>()
  const inFlight = new Set<Promise<unknown>>()
  let stopped = false
  let started = false

  function scheduleTick(state: JobState, delayMs: number): void {
    if (stopped) return
    // Never orphan a live timer: two racing reschedules must collapse to one firing.
    if (state.timerId !== null) clock.clearTimeout(state.timerId)
    state.timerId = clock.setTimeout(() => {
      state.timerId = null
      void tick(state)
    }, delayMs)
  }

  async function runTracked(state: JobState): Promise<unknown> {
    const p = runHandler(state)
    state.running = p
    inFlight.add(p)
    try {
      return await p
    } finally {
      state.running = null
      inFlight.delete(p)
    }
  }

  async function runHandler(state: JobState): Promise<unknown> {
    state.invocations++
    try {
      return await state.config.handler()
    } catch (err) {
      logger.warn({ err, job: state.config.name }, `Job '${state.config.name}' handler error`)
      return undefined
    }
  }

  function parkUntilNextOpen(state: JobState, status: MarketStatus, marketOpenMs: number): void {
    const nextOpenMs = status.nextOpen ? new Date(status.nextOpen).getTime() : NaN
    const wakeDelayMs = nextOpenMs - clock.now()
    if (wakeDelayMs > 0) {
      logger.info(
        { job: state.config.name, nextOpen: status.nextOpen },
        `job ${state.config.name} parked until next market open at ${status.nextOpen}`
      )
      scheduleTick(state, wakeDelayMs)
    } else {
      logger.warn(
        { job: state.config.name, nextOpen: status.nextOpen },
        `nextOpen was unusable for ${state.config.name}; scheduling fallback re-check at marketOpenMs`
      )
      scheduleTick(state, marketOpenMs)
    }
  }

  async function reschedule(state: JobState): Promise<void> {
    if (stopped) return
    let status: MarketStatus
    try {
      status = await getBroker().getMarketStatus()
    } catch (err) {
      logger.warn(
        { err, job: state.config.name },
        `Job '${state.config.name}' reschedule failed; falling back to default cadence`
      )
      if (state.config.cadence.kind === 'interval') {
        scheduleTick(state, state.config.cadence.marketOpenMs)
      }
      return
    }
    if (stopped) return

    const { cadence } = state.config
    if (cadence.kind === 'interval') {
      const delayMs = decideNextCadenceMs(cadence, status)
      if (delayMs !== null) {
        scheduleTick(state, delayMs)
      } else {
        parkUntilNextOpen(state, status, cadence.marketOpenMs)
      }
    } else {
      const nowMs = clock.now()
      const fireAt = decideAfterCloseFireAt(status.nextClose, cadence.offsetMinutes, nowMs)
      if (fireAt !== null) scheduleTick(state, fireAt - nowMs)
    }
  }

  async function tick(state: JobState): Promise<void> {
    if (state.running !== null) return
    await runTracked(state)
    await reschedule(state)
  }

  async function startAfterClose(state: JobState, offsetMinutes: number): Promise<void> {
    if (stopped) return
    let status: MarketStatus
    try {
      status = await getBroker().getMarketStatus()
    } catch (err) {
      logger.warn(
        { err, job: state.config.name },
        `Job '${state.config.name}' afterClose start failed`
      )
      return
    }
    if (stopped) return
    const nowMs = clock.now()
    const fireAt = decideAfterCloseFireAt(status.nextClose, offsetMinutes, nowMs)
    if (fireAt !== null) scheduleTick(state, fireAt - nowMs)
  }

  function autoStart(state: JobState): void {
    const { cadence } = state.config
    if (cadence.kind === 'interval') {
      scheduleTick(state, 0)
    } else {
      void startAfterClose(state, cadence.offsetMinutes)
    }
  }

  return {
    register(config: JobConfig): void {
      if (jobs.has(config.name)) {
        throw new SchedulerError('already_registered', `Job already registered: ${config.name}`)
      }
      const state: JobState = { config, timerId: null, invocations: 0, running: null }
      jobs.set(config.name, state)
      if (started && !stopped) autoStart(state)
    },

    start(): void {
      started = true
      for (const state of jobs.values()) {
        autoStart(state)
      }
    },

    stop(): Promise<void> {
      stopped = true

      for (const state of jobs.values()) {
        if (state.timerId !== null) {
          clock.clearTimeout(state.timerId)
          state.timerId = null
        }
      }

      if (inFlight.size === 0) return Promise.resolve()

      let timeoutId: TimerId | null = null
      const drainPromise = Promise.all([...inFlight]).then(() => {})
      const timeoutPromise = new Promise<void>((resolve) => {
        timeoutId = clock.setTimeout(resolve, 5_000)
      })

      return Promise.race([drainPromise, timeoutPromise]).finally(() => {
        if (timeoutId !== null) clock.clearTimeout(timeoutId)
      })
    },

    async runNow(jobName: string): Promise<unknown> {
      const state = jobs.get(jobName)
      if (!state) {
        throw new SchedulerError('job_not_found', `Job not found: ${jobName}`)
      }

      // A run is already in flight (e.g. the scheduled after-close tick): join it.
      // Its completion path reschedules, so starting a second run here would both
      // double-hit the provider and leave two reschedules racing to arm timers.
      if (state.running !== null) return state.running

      if (state.timerId !== null) {
        clock.clearTimeout(state.timerId)
        state.timerId = null
      }

      const result = await runTracked(state)
      await reschedule(state)
      return result
    },

    getRegistry(): JobRegistryEntry[] {
      return Array.from(jobs.values()).map((state) => ({
        name: state.config.name,
        cadence: state.config.cadence,
        invocations: state.invocations
      }))
    }
  }
}
