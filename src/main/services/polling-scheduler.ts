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

export type JobHandler = () => Promise<void>

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
  runNow(jobName: string): Promise<void>
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
}

export function createPollingScheduler(
  brokerProvider: BrokerProvider,
  clock: Clock = realClock
): PollingScheduler {
  const jobs = new Map<string, JobState>()
  const inFlight = new Set<Promise<void>>()
  let stopped = false
  let started = false

  function scheduleTick(state: JobState, delayMs: number): void {
    if (stopped) return
    state.timerId = clock.setTimeout(() => void tick(state), delayMs)
  }

  async function runHandler(state: JobState): Promise<void> {
    state.invocations++
    try {
      await state.config.handler()
    } catch (err) {
      logger.warn({ err, job: state.config.name }, `Job '${state.config.name}' handler error`)
    }
  }

  async function reschedule(state: JobState): Promise<void> {
    if (stopped) return
    let status: MarketStatus
    try {
      status = await brokerProvider.getMarketStatus()
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
      if (delayMs !== null) scheduleTick(state, delayMs)
    } else {
      const nowMs = clock.now()
      const fireAt = decideAfterCloseFireAt(status.nextClose, cadence.offsetMinutes, nowMs)
      if (fireAt !== null) scheduleTick(state, fireAt - nowMs)
    }
  }

  async function tick(state: JobState): Promise<void> {
    const p = runHandler(state)
    inFlight.add(p)
    try {
      await p
    } finally {
      inFlight.delete(p)
    }
    await reschedule(state)
  }

  async function startAfterClose(state: JobState, offsetMinutes: number): Promise<void> {
    if (stopped) return
    let status: MarketStatus
    try {
      status = await brokerProvider.getMarketStatus()
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
      const state: JobState = { config, timerId: null, invocations: 0 }
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

      const drainPromise = Promise.all([...inFlight]).then(() => {})
      const timeoutPromise = new Promise<void>((resolve) => {
        clock.setTimeout(resolve, 5_000)
      })

      return Promise.race([drainPromise, timeoutPromise])
    },

    async runNow(jobName: string): Promise<void> {
      const state = jobs.get(jobName)
      if (!state) {
        throw new SchedulerError('job_not_found', `Job not found: ${jobName}`)
      }

      if (state.timerId !== null) {
        clock.clearTimeout(state.timerId)
        state.timerId = null
      }

      const p = runHandler(state)
      inFlight.add(p)
      try {
        await p
      } finally {
        inFlight.delete(p)
      }

      await reschedule(state)
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
