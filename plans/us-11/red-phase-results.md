# Red Phase Results: US-11 — Display the full wheel leg chain with running cost basis

## Feature Context

- **Feature directory**: `plans/us-11/`
- **User story**: `docs/epics/02-stories/US-11-wheel-leg-chain-display.md`
- **Plan file**: `plans/us-11/plan.md`

## Test Files Created/Modified

- `e2e/leg-chain-display.spec.ts` — one E2E test per acceptance criterion for the leg-chain display

## Interfaces Under Test

These tests exercise the existing Electron app flows and UI contracts rather than importing a single module API directly:

- new-wheel creation flow (`#/new`)
- position detail page (`#/positions/:id`)
- leg history table rendering on the position detail page
- assignment action (`record-assignment-btn`)
- open covered call action (`open-covered-call-btn`)
- close covered call early action (`close-cc-early-btn`)
- record call-away action (`record-call-away-btn`)
- record CC expiration action (`record-cc-expiration-btn`)

## Test Coverage Summary

### E2E Coverage (`e2e/leg-chain-display.spec.ts`)

- [x] AC-1: leg chain displays all legs in chronological order
- [x] AC-2: running cost basis column shows basis after each leg including CC_CLOSE carry-forward
- [x] AC-3: completed wheel shows final P&L in the chain footer
- [x] AC-4: ASSIGN leg displays shares received not premium
- [x] AC-5: CALLED_AWAY leg shows call-away strike and inherits running basis
- [x] AC-6: CC_EXPIRED leg displays expired worthless in muted style
- [x] AC-7: single-leg position shows partial chain with initial basis

## Test Design Assumptions

- The leg history table is identified by the presence of the `Running Basis / Share` header.
- Table columns are asserted by index using the story-specified order: Role, Action, Strike, Expiration, Contracts, Premium, Fill Date, Running Basis.
- The seeded E2E flows reuse `e2e/helpers.ts` to stay aligned with existing wheel lifecycle tests.
- The same-day close/call-away/expiry scenarios are intentionally realistic because the current app defaults many action dates to `today`.

## Test Execution Results

```bash
pnpm exec electron-vite build && pnpm exec vitest run --config vitest.e2e.config.ts e2e/leg-chain-display.spec.ts

FAIL e2e/leg-chain-display.spec.ts > US-11: wheel leg chain display > running cost basis column shows basis after each leg including CC_CLOSE carry-forward
AssertionError: expected '$174.20' to be '$176.50'

FAIL e2e/leg-chain-display.spec.ts > US-11: wheel leg chain display > CALLED_AWAY leg shows call-away strike and inherits running basis
Error: Could not find leg history row for role: Called Away

FAIL e2e/leg-chain-display.spec.ts > US-11: wheel leg chain display > CC_EXPIRED leg displays expired worthless in muted style
TimeoutError: page.click: Timeout 30000ms exceeded.
  waiting for locator('[data-testid="record-cc-expiration-btn"]')
```

## Verification

- ✅ No syntax errors in the new test file
- ✅ Imports and shared helpers resolve correctly
- ✅ The failures come from missing or incorrect application behavior, not from test setup bugs
- ✅ Four ACs already pass with the new E2E coverage in place

## Handoff to Green Phase

Green phase should address these gaps:

1. Fix running-basis derivation for multi-leg chains that occur on the same calendar day so earlier legs do not inherit later same-day snapshots.
2. Ensure the called-away chain renders a row discoverable as `Called Away` in the leg history.
3. Make the CC-expiration path reachable and render the expected `CC Expired` row for the seeded expired-CC scenario.

## Notes

An attempted `pnpm test:e2e -- e2e/leg-chain-display.spec.ts` run executed the full E2E suite because the script-level argument forwarding did not narrow the Vitest include set. The targeted `pnpm exec vitest run --config vitest.e2e.config.ts e2e/leg-chain-display.spec.ts` command was used instead for the red-phase gate.
