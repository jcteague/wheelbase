---
page: docs/spec/features/us-47-49-broker-ac-hardening.md
audited_at: 2026-09-28
findings: 2
---

# Audit: us-47-49-broker-ac-hardening.md

## Verified (14)

- ✓ `BrokerError` has an optional `deeplink?: string` constructor param stored as a readonly field — `src/main/integrations/broker-provider.ts:9-16`.
- ✓ `requireCredentials()` throws `BrokerError('auth_failed', 'Alpaca credentials not configured', 'settings/credentials/alpaca')` — `src/main/integrations/alpaca-broker.ts:84-92`.
- ✓ `getAccountInfo()` and `getActivities()` call `this.requireCredentials()` first — `alpaca-broker.ts:127,143`.
- ✓ Paper env with an `AK` key maps to `environment_mismatch` with the message `'Environment mismatch — these are LIVE keys, not paper keys'` — `alpaca-broker.ts:98-102`.
- ✓ Live env with a `P…` key maps to `environment_mismatch` (the opposite direction) — `alpaca-broker.ts:104-108`.
- ✓ A paper key on 401 falls through to `auth_failed` — `alpaca-broker.ts:110`.
- ✓ `toMoney(value) = new Decimal(value).toFixed(4)` — `alpaca-broker.ts:56-58`, applied to `buyingPower`, `portfolioValue` and `cash` — `alpaca-broker.ts:131-133`.
- ✓ Environment routing uses `paper: this.config.environment === 'paper'` — `alpaca-broker.ts:78`.
- ✓ `handleIpcCall` has a dedicated `BrokerError` branch that spreads `deeplink` onto the `{ ok: false }` envelope — `src/main/ipc/utils.ts:34-42`; the envelope type is `{ ok: false; code?; deeplink?; errors }` — `utils.ts:11`.
- ✓ US-49 park-wake: a `null` delay computes `wakeDelayMs = nextOpenMs - clock.now()` and calls `scheduleTick` (INFO `job {name} parked until next market open at {nextOpen}`); a non-positive delay falls back to `marketOpenMs` with WARN `nextOpen was unusable for {name}; scheduling fallback re-check at marketOpenMs` — `src/main/services/polling-scheduler.ts:152-168,193-195`.
- ✓ The wake timer reuses `state.timerId`, which `stop()` clears — `polling-scheduler.ts:120-127,253-258`.
- ✓ `e2e/polling-scheduler.spec.ts` contains US-49 AC-1, AC-4 and AC-5 scenarios — lines 260, 281, 299.
- ✓ Linked ADRs `deeplink-in-ipc-error-envelope.md` and `park-wake-reuses-scheduletick.md`, `contracts/alpaca-integration.md`, `contracts/ipc-handlers.md` and `us-46-polling-scheduler.md` all exist.
- ✓ All five listed source files exist.

## Drift (2)

- ✗ **`getMarketStatus()` is no longer a broker method.** The page (What was built, Source files) says `AlpacaBrokerProvider.getMarketStatus()` calls `requireCredentials()`. `alpaca-broker.ts` has no `getMarketStatus`. It lives on the market-data adapter (`src/main/integrations/alpaca-market-data.ts:223`), and `alpaca-broker.test.ts:325` asserts `provider.getMarketStatus` is undefined. AC-2's "every broker method" now covers only `getAccountInfo` and `getActivities`. Suggested fix: drop `getMarketStatus` from the broker description, or frame it as history.
- ✗ **The park-wake block has moved.** The page says the `else` branch inline in `reschedule()` computes `new Date(status.nextOpen).getTime() - clock.now()`. That logic is now a separate `parkUntilNextOpen(state, status, marketOpenMs)` helper (`polling-scheduler.ts:152`), called from `reschedule()` (`:195`). It also guards a missing `nextOpen` via `NaN` (`:153`). The behaviour matches. Low severity.

## Unverifiable (2)

- ? "The `stop()` method and the `PollingScheduler` public interface are unchanged" is a historical claim about the US-49 diff. The interface has since gained a `runNow` `trigger` option (`polling-scheduler.ts:37`).
- ? The US-49 AC-7 "no burst on system wake" guarantee is structural and argued, not statically checkable.

## Missing files (0)
