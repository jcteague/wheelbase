# Refactor Phase Results: US-37 Layer 1

## Automated Simplification

- code-simplifier agent run: passed
- Files processed:
  - `src/main/services/settings.ts`
  - `src/main/services/settings-connections.ts`
  - `src/main/services/settings.test.ts`
  - `src/main/services/settings-connections.test.ts`
  - `migrations/006_add_credential_settings.sql`
  - `src/main/db/migrate.test.ts`
- Agent-reported changed files:
  - `src/main/services/settings.ts`
  - `src/main/services/settings-connections.ts`
  - `src/main/db/migrate.test.ts`

## Manual Refactorings Performed

### 1. Clarified Refactor Skill File-Size Guidance

**File**: `.agents/skills/source-command-refactor/SKILL.md`

**Before**: The workflow mixed a 300-line code smell guideline with a stricter ~200-line file-size gate.

**After**: The workflow now says files over ~300 lines should be reviewed for splitting and split only when it improves cohesion or readability.

**Reason**: Prevents unnecessary file splits for cohesive files while preserving the intent to review large files.

### 2. Reverted Unnecessary Type Split

**File**: `src/main/services/settings.ts`

**Before**: Public settings service types had been split into `src/main/services/settings-types.ts` solely to satisfy the mistaken file-size interpretation.

**After**: The types are back in `settings.ts`; the temporary `settings-types.ts` file was removed.

**Reason**: Keeps cohesive service API types close to the service implementation. No behavior changed.

### 3. Preserved Simplifier Helpers

**File**: `src/main/services/settings.ts`

**Before**: Active broker environment calculation was repeated at call sites.

**After**: `getEffectiveActiveEnvironment` centralizes the effective-active-env lookup.

**Reason**: Reduces small duplication without changing behavior.

## Test Execution Results

```bash
pnpm test
```

Result:

- 107 test files passed
- 1182 tests passed

Focused verification:

```bash
pnpm exec vitest run src/main/services/settings.test.ts src/main/services/settings-connections.test.ts src/main/db/migrate.test.ts
```

Result:

- 3 test files passed
- 20 tests passed

## Quality Checks

- ✅ `pnpm test` passed
- ✅ `pnpm typecheck` passed
- ✅ `pnpm lint` exited successfully

`pnpm lint` reported 21 prettier warnings in existing `e2e/*.spec.ts` files outside the Layer 1 scope. No lint errors were reported.

## Remaining Tech Debt

- Existing E2E prettier warnings remain outside this refactor scope.

## Notes

- Massive credentials remain shared app configuration and are not stored in `credential_settings`.
- `credential_settings` remains generic for future broker vendors, but this story writes only Alpaca rows.

---

# Refactor Phase Results: US-37 Layer 2

## Automated Simplification

- code-simplifier agent run: not dispatched separately
- Files processed:
  - `src/main/index.ts`
  - `src/main/integrations/broker-factory.ts`
  - `src/main/integrations/market-data-factory.ts`
  - `src/main/ipc/broker.ts`
  - `src/main/ipc/settings.ts`
  - `src/main/schemas.ts`
  - `src/preload/index.ts`
  - `src/preload/index.d.ts`
  - `src/main/integrations/broker-factory.test.ts`
  - `src/main/integrations/market-data-factory.test.ts`
  - `src/main/ipc/settings.test.ts`

## Manual Refactorings Performed

### 1. Typed Runtime Refresh Path

**Files**: `src/main/index.ts`, `src/main/ipc/broker.ts`

**Before**: The broker provider was created once at startup and broker IPC handlers closed over that fixed instance.

**After**: Broker IPC handlers now resolve the current provider on each call, and settings changes recreate only the broker factory cache.

**Reason**: This keeps market data untouched during broker environment switches while avoiding a heavier service-container abstraction.

### 2. Configurable Factories With Narrow Inputs

**Files**: `src/main/integrations/broker-factory.ts`, `src/main/integrations/market-data-factory.ts`

**Before**: Both factories read process env directly, which made persisted settings awkward to integrate and harder to test.

**After**: Both factories accept small configuration loaders; Massive stays app-config driven, and the broker factory loads the active Alpaca credential pair from settings.

**Reason**: The factories are easier to test and can honor persisted app state without broadening their responsibilities.

### 3. Thin Settings IPC Surface

**Files**: `src/main/ipc/settings.ts`, `src/main/schemas.ts`, `src/preload/index.ts`, `src/preload/index.d.ts`

**Before**: There was no settings IPC boundary or preload API for credential status, Alpaca credential management, or connection probes.

**After**: The settings handlers validate payloads with Zod, delegate to settings services and connection probes, expose only the required Alpaca operations, and keep failure shapes consistent.

**Reason**: This matches the project’s thin-handler rule and keeps Massive credential entry explicitly out of the renderer API.

## Test Execution Results

```bash
pnpm test
pnpm lint
pnpm typecheck
```

Results:

- `pnpm test` passed: 108 files, 1188 tests
- `pnpm lint` passed
- `pnpm typecheck` passed

Focused verification:

```bash
pnpm exec vitest run src/main/integrations/market-data-factory.test.ts src/main/integrations/broker-factory.test.ts src/main/ipc/settings.test.ts src/main/ipc/broker.test.ts
pnpm exec tsc --noEmit -p tsconfig.node.json --composite false
```

Results:

- 4 focused test files passed
- Node typecheck passed

## Quality Checks

- ✅ `pnpm test` passed
- ✅ `pnpm lint` passed
- ✅ `pnpm typecheck` passed
- ⚠️ `pnpm format` attempted a repo-wide Prettier run but exited non-zero because `.agents/skills/code-simplifier/SKILL.md` was not writable in this session

## Remaining Tech Debt

- `pnpm test` still emits existing React `act(...)` warnings in unrelated renderer tests.
- Broker/market status renderer hooks for the new settings surface are still pending in Layer 3.
