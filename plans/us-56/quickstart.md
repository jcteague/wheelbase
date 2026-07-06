# Quickstart: US-56 — Earnings-Proximity Alert

## Environment setup

Nothing new is required to run the tests — every test injects a stub earnings fetcher and a pinned `now`; no Finnhub key, no network, no migration, no seed data.

For **live manual verification** only (optional):

1. Create a free Finnhub API key at https://finnhub.io/register.
2. Add `MAIN_VITE_FINNHUB_API_KEY=<key>` to `.env` (or export `FINNHUB_API_KEY` in the shell).
3. `pnpm dev` — with an active CSP/CC position whose ticker has earnings within 10 calendar days (and on/before the leg's expiration), a medium-urgency "Earnings in N days before your YYYY-MM-DD expiration" row appears in the dashboard management queue within one evaluation cycle (60 s while the market is open). Without a key the app runs normally; the rule just skips (one WARN `earnings_fetch_no_api_key` in the log).

> If `pnpm test` was run before `pnpm dev` in the same checkout, remember the better-sqlite3 double-build: `npx electron-rebuild -f -w better-sqlite3` first, then `pnpm rebuild better-sqlite3`.

## Running the tests for this story

```bash
# Everything (required green before done)
pnpm test

# Story-focused, while developing:
pnpm vitest run src/main/core/alerts.test.ts                    # rule predicate/summary/skip unit tests
pnpm vitest run src/main/integrations/finnhub-earnings.test.ts  # integration: fetch, selection, cache, isolation
pnpm vitest run src/main/services/evaluate-alerts.test.ts       # service wiring: boundary fetch, input mapping
pnpm vitest run src/main/services/evaluate-alerts.e2e.test.ts   # AC-driven scenarios (US-56 describe block)
```

## Post-change checklist (per CLAUDE.md, after every change)

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

## Passing criteria

- All four US-56 acceptance scenarios pass as named tests in `evaluate-alerts.e2e.test.ts` (`describe('US-56 acceptance', ...)`), including the exact summary string `Earnings in 6 days before your 2026-08-21 expiration`.
- The missing-data scenario asserts both "no EARNINGS_PROXIMITY row" **and** the DEBUG `alert_rule_skipped` log with reason `missing_earnings_date`.
- No regression in the existing US-50/52/53/54/55 alert suites (the `AlertEvaluationInput` extension must keep every existing test compiling via the shared `makeInput` factory and test-utils defaults).
- `pnpm lint` and `pnpm typecheck` clean.
