# Issue: LegData snake_case / camelCase mismatch between renderer types and IPC responses

**Priority:** P2
**Type:** Tech debt
**Status:** Open
**Discovered:** US-12 (Roll CSP) — `RollCspSuccess` read `premium_per_contract` (undefined at runtime) → NaN

---

## Problem

The renderer `LegData` type in `src/renderer/src/api/positions.ts` uses `premium_per_contract` (snake_case), but the IPC layer returns `premiumPerContract` (camelCase). This mismatch causes:

1. **Test fixtures need both field names** — `premium_per_contract` to satisfy TypeScript, `premiumPerContract` to match runtime (see `CloseCcEarlySheet.test.tsx`, `RollCspSheet.test.tsx`)
2. **Unsafe `as unknown as` casts** in API adapter functions instead of proper field mapping
3. **Runtime bugs** when components access the wrong field name (the NaN bug in US-12)

The `createPosition` adapter at line 542 explicitly maps: `premium_per_contract: result.leg.premiumPerContract`. Most other adapters skip this mapping and use `return result as unknown as XResponse`.

## Scope

~20 files across `src/renderer/` reference `premium_per_contract`. Key files:

- `src/renderer/src/api/positions.ts` — `LegData` type definition + all adapter functions
- `src/renderer/src/components/OpenCoveredCallSheet.tsx`
- `src/renderer/src/components/NewWheelForm.tsx`
- All `*.test.tsx` files with leg fixtures

## Proposed Fix

Option A: **Normalize `LegData` to camelCase** — change `premium_per_contract` → `premiumPerContract` in the type, then update all references. This aligns the type with what IPC actually returns and removes the need for mapping or dual fields.

Option B: **Add proper field mapping in each adapter** — keep `LegData` as snake_case but explicitly map in every `rollCsp()`, `closeCoveredCallEarly()`, etc. More work, more places to forget.

Option A is recommended — it's a single sweep with TypeScript guiding every needed change.
