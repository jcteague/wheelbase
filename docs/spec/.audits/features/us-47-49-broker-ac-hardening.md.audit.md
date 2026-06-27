---
page: docs/spec/features/us-47-49-broker-ac-hardening.md
audited_at: 2026-06-27
findings: 0
---

# Audit: docs/spec/features/us-47-49-broker-ac-hardening.md

## Verified (18)

- ✓ `src/main/integrations/broker-provider.ts` exists; `BrokerError` has readonly `deeplink?: string` field + 3-arg constructor `(code, message, deeplink?)` at lines 11-16.
- ✓ `src/main/integrations/alpaca-broker.ts` exists with all cited members: `toMoney()` (line 83), `requireCredentials()` (111), `wrapError()` (121), `getAccountInfo()` (153), `getActivities()` (169), `getMarketStatus()` (196).
- ✓ AC-1: `getAccountInfo` normalizes `buyingPower`/`portfolioValue`/`cash` via `toMoney(...)` (alpaca-broker.ts:158-160).
- ✓ AC-2/AC-3: `requireCredentials()` throws with deeplink `'settings/credentials/alpaca'` (alpaca-broker.ts:116).
- ✓ `getActivities()` and `getMarketStatus()` both call `this.requireCredentials()` as first line (alpaca-broker.ts:170, 197).
- ✓ AC-4: paper + `AK`-key on auth error → `BrokerError('environment_mismatch', 'Environment mismatch — these are LIVE keys, not paper keys')` (wrapError, lines 125-131).
- ✓ AC-5: paper + PK key does not match the `AK` branch nor the live branch, so it falls through to `throw new BrokerError('auth_failed', ...)` (line 138) — matches claim.
- ✓ AC-3: `handleIpcCall` in `src/main/ipc/utils.ts` has a dedicated `BrokerError` branch (line 29) that spreads `deeplink` onto the `{ ok: false }` envelope when present (line 35); envelope type includes `code?` and `deeplink?` (line 14).
- ✓ `src/main/services/polling-scheduler.ts` `reschedule()`/park-wake: computes `wakeDelayMs = nextOpenMs - clock.now()` (line 125); if `> 0` logs INFO `job {name} parked until next market open at {nextOpen}` and `scheduleTick(state, wakeDelayMs)` (lines 126-131); else logs WARN `nextOpen was unusable for {name}; scheduling fallback re-check...` and `scheduleTick(state, marketOpenMs)` (lines 134-137). Matches AC-1, AC-6, and architecture-decisions narrative.
- ✓ `e2e/polling-scheduler.spec.ts` exists and contains US-49 park-wake scenarios (parked-job tests around lines 90-108, plus system-wake test at 208).
- ✓ All spec links resolve: `../architecture/02-adrs/deeplink-in-ipc-error-envelope.md`, `../architecture/02-adrs/park-wake-reuses-scheduletick.md`, `../contracts/alpaca-integration.md`, `../contracts/ipc-handlers.md`, `./us-46-polling-scheduler.md`.

## Drift (0)

None.

## Unverifiable (3)

- ? AC-5 wording: page asserts the paper+PK path returns `auth_failed`; code path confirms this by fall-through, but the live+PK branch uses `startsWith('P')` (not `'PK'`). Behavior matches the AC, but the "starts with `PK`" detail is narrative; flagged for awareness only.
- ? AC-7 (system wake does not burst) is described as "structurally guaranteed" — a design assertion, not mechanically grepable.
- ? "reuses the same `state.timerId` slot so `stop()` cancels at no extra cost" is verified structurally (no `parkTimerId` field exists; `scheduleTick` writes `state.timerId`), but the no-extra-cost claim is narrative.

## Missing files (0)

None.
