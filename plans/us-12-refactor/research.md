# Research: US-12 Refactor — Active Leg, Roll Helpers, RHF Migration

## 1. Active Leg SQL Centralization

- **Decision:** Extract a reusable SQL subquery function that resolves the "current active leg" for a position based on its phase. Use it in both `list-positions.ts` and `get-position.ts`.
- **Rationale:** `list-positions.ts` currently queries for `CSP_OPEN` and `CC_OPEN` leg roles only, missing `ROLL_TO` legs entirely. After a roll, the position list shows null strike/expiration. The correct logic already exists in `get-position.ts` (phase-aware: `CSP_OPEN → CSP_OPEN|ROLL_TO`, `CC_OPEN → CC_OPEN|ROLL_TO`). Extracting this into a shared SQL fragment eliminates the inconsistency and prevents future callers from getting it wrong.
- **Alternatives considered:**
  - Persisting an `is_active` or `superseded_at` column on legs — rejected as over-engineering for now; would require a migration and schema change for what is essentially a query-level concern.
  - A TypeScript function that post-filters legs — rejected because the SQL subquery approach is more efficient and keeps the join logic in one place.

## 2. Shared Roll Domain Helpers

- **Decision:** Create `src/renderer/src/lib/rolls.ts` with `getRollTypeLabel()`, `computeNetCreditDebit()`, and `rollCreditDebitColors()` functions.
- **Rationale:** `getRollTypeLabel` is copy-pasted identically in `RollCspForm.tsx` and `RollCspSuccess.tsx`. Net credit/debit color selection (`isCredit ? green : gold`) is duplicated with slight variations. These are pure functions with no component dependencies — ideal for extraction.
- **Alternatives considered:**
  - Putting helpers in `src/renderer/src/lib/format.ts` — rejected because roll-specific logic is a separate concern from generic formatting.
  - A shared component for net credit display — rejected because the Form and Success screens use different visual treatments (inline preview vs. hero card), so extracting the *data* is the right level of abstraction.

## 3. RHF + Zod Migration for RollCspSheet

- **Decision:** Replace the 10 `useState` calls and imperative `validate()` function in `RollCspSheet.tsx` with `useForm` + `zodResolver`, following the same pattern used in `CloseCspForm.tsx`.
- **Rationale:** Every other form in the app uses RHF+Zod. The current hand-managed state has NaN edge cases (e.g., clearing a numeric field) and duplicates validation logic that the server-side `RollCspPayloadSchema` already defines. The Zod schema can also validate date ordering (new expiration > current expiration) using `.refine()`, matching the `CloseCspForm` pattern.
- **Alternatives considered:**
  - Keeping hand-managed state but adding Zod validation only — rejected because it doesn't reduce the useState boilerplate and loses RHF's error-clearing-on-change behavior.
  - Using the server-side `RollCspPayloadSchema` directly — rejected because the renderer needs string-based fields (form inputs are strings) while the server schema expects numbers. A renderer-side Zod schema with string inputs + parse-on-submit is the established pattern (see `CloseCspForm`).
