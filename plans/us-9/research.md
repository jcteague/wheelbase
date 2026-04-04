## CC Expiry Lifecycle Transition

- **Decision:** `expireCc` returns `{ phase: 'HOLDING_SHARES' }`, not `WHEEL_COMPLETE`
- **Rationale:** CC expiry keeps the wheel alive — the trader still holds shares and will sell another CC. This is the key structural difference from `expireCsp` (which ends the wheel at `WHEEL_COMPLETE`). The position stays `ACTIVE` with `closedDate = null`.
- **Alternatives considered:** Reusing `expireCsp` with a flag — rejected; separate function keeps core engine functions single-purpose.

---

## Cost Basis Snapshot on CC Expiry

- **Decision:** No new `cost_basis_snapshots` row is written on CC expiry.
- **Rationale:** The CC premium was already incorporated into the snapshot created during `openCoveredCallPosition` (US-7). The EXPIRE leg records the fact that the contract expired; no financial event changes the basis.
- **Alternatives considered:** Writing a snapshot for audit trail — rejected per story technical notes; the existing snapshot is already correct.

---

## Error Messages for Validation Failures

- **Decision:** Use `"No open covered call on this position"` for wrong-phase errors; use `"Cannot record expiration before the expiration date (YYYY-MM-DD)"` (with the literal date) for premature expiry.
- **Rationale:** AC 3 and AC 4 quote exact messages. The date-in-message pattern requires `expireCc` to receive `expirationDate` as a string it can interpolate.
- **Alternatives considered:** Generic "invalid phase" message from `expireCsp` — rejected because AC specifies a different message.

---

## No New DB Migration Required

- **Decision:** US-9 uses existing `legs` and `positions` tables only.
- **Rationale:** The `EXPIRE` leg role and `CALL` instrument type are already in the type enums (`src/main/core/types.ts`). The `HOLDING_SHARES` phase is already a valid `WheelPhase`. No schema changes needed.
- **Alternatives considered:** None — no new schema elements are introduced.

---

## IPC Channel Naming

- **Decision:** Channel is `positions:expire-cc`; preload method is `expireCc`.
- **Rationale:** Follows established `positions:{verb}-{noun}` pattern (e.g. `positions:expire-csp`, `positions:open-cc`).
- **Alternatives considered:** `positions:expire-covered-call` — too verbose given the existing abbreviation convention.

---

## "Record Expiration →" Button Visibility Rule

- **Decision:** Button appears in `PositionDetailActions` when `phase === 'CC_OPEN'` AND `computeDte(activeLeg.expiration) <= 0` (i.e. today is on or after the CC expiration date).
- **Rationale:** Matches AC 3 ("Reject expiration before the expiration date") and the technical note: "Record Expiration → button visible in position detail header when phase = CC_OPEN and today ≥ CC expiration". `computeDte` already exists in `src/renderer/src/lib/format.ts`.
- **Alternatives considered:** Always showing the button and relying on backend rejection — provides worse UX; frontend guard matches the mockup's implicit assumption that the button only appears at expiration.

---

## "Sell New Covered Call" CTA Navigation

- **Decision:** The success-state CTA closes the sheet by calling `onClose()`. After TanStack Query cache invalidation, the position refetches with `phase = HOLDING_SHARES` and the `OpenCoveredCallSheet` button becomes visible in the position detail header.
- **Rationale:** The user is already on the position detail page. Closing the sheet and letting the query refresh naturally surfaces the CC form — no extra navigation is needed.
- **Alternatives considered:** Explicit `navigate(#/positions/${positionId})` — redundant since the user is already there.

---

## sharesHeld in the IPC Result

- **Decision:** `ExpireCcPositionResult` includes `sharesHeld: number` computed from the ASSIGN leg (`assignLeg.contracts * 100`).
- **Rationale:** The success screen needs "Still Holding: 100 shares of AAPL" and the renderer component should not re-query the position to find this. The service already loads the position detail (including all legs) to perform validation, so the cost of computing this is zero.
- **Alternatives considered:** Derive sharesHeld from the existing snapshot's `basisPerShare` — unreliable, as `basisPerShare` is a money value not a share count.

---

## Rebase on Local main Before Implementation

- **Decision:** The `worktree-us-9` branch was created from `origin/main` (commit `47f5412`), which does not yet include the US-7 "open cover calls" commit (`9fb1928`) on local `main`. Implementation must rebase or merge `main` into `worktree-us-9` first.
- **Rationale:** `expireCc` depends on `openCoveredCall` being present in `lifecycle.ts`, the `CC_OPEN` leg query in `get-position.ts`, and the `openCoveredCall` service. All of these are in the US-7 commit on local `main`.
- **Alternatives considered:** Implementing without the US-7 changes — not feasible; there would be no way to set up a CC_OPEN fixture for tests.
