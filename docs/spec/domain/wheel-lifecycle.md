# Wheel Lifecycle

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-17 -->

## Overview

A **wheel** is a position that progresses through a small set of phases as the
trader sells cash-secured puts (CSPs), accepts assignment into shares, sells
covered calls (CCs) against those shares, and eventually has the shares called
away or the option expire worthless. The phase set is fixed and every
transition between phases is owned by a pure function in
`src/main/core/lifecycle.ts`.

The lifecycle engine is the canonical source of truth for "what is legal next."
Services call it before writing legs and snapshots; if the engine throws a
`ValidationError`, no DB mutation happens. Rolls do **not** move the position
to a new phase — they keep the wheel in `CSP_OPEN` (or `CC_OPEN` for CC rolls)
and append a linked `ROLL_FROM` / `ROLL_TO` leg pair sharing a `roll_chain_id`.

There are three ways to reach the terminal `WHEEL_COMPLETE` phase:

- `expireCsp` — the CSP expired worthless before assignment (full premium kept).
- `recordCallAway` — the shares were exercised against the trader at the CC
  strike (final cycle P&L is the share appreciation `(ccStrike − basisPerShare)
× sharesHeld`).
- (`closeCsp` is _not_ one of them — early buy-to-close lands in the distinct
  terminal phases `CSP_CLOSED_PROFIT` / `CSP_CLOSED_LOSS`.)

A wheel that has reached `HOLDING_SHARES` runs an inner **CC sub-loop**:
`HOLDING_SHARES → CC_OPEN → HOLDING_SHARES`. The CC side of the loop is exited
in one of three ways: `closeCoveredCall` (early buy-to-close) and `expireCc`
(CC expired worthless) both return the position to `HOLDING_SHARES` and keep
the wheel alive, while `recordCallAway` ends the wheel at `WHEEL_COMPLETE`.
Within `CC_OPEN`, `rollCc` keeps the position in `CC_OPEN` and appends a
linked CALL roll pair (us-14) — the CC analogue of `rollCsp`.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-17 -->

## Phases

The complete `WheelPhase` Zod enum lives in `src/main/core/types.ts`. The table
below lists every value and the broader `position.status` (`ACTIVE` /
`CLOSED`) it implies.

| Phase               | Meaning                                                                                                                     | Status   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------- |
| `CSP_OPEN`          | A cash-secured put has been sold and is open. The wheel is collecting premium and waiting on expiration.                    | `ACTIVE` |
| `HOLDING_SHARES`    | The CSP was assigned; the trader now holds `contracts × 100` shares at the assignment strike.                               | `ACTIVE` |
| `CC_OPEN`           | A covered call has been sold against the held shares.                                                                       | `ACTIVE` |
| `CSP_EXPIRED`       | Reserved phase value (referenced for completeness, not the live terminal — `expireCsp` lands directly at `WHEEL_COMPLETE`). | `CLOSED` |
| `CSP_CLOSED_PROFIT` | Terminal — the CSP was bought to close at a net profit.                                                                     | `CLOSED` |
| `CSP_CLOSED_LOSS`   | Terminal — the CSP was bought to close at a net loss (breakeven counts as loss).                                            | `CLOSED` |
| `CC_EXPIRED`        | Reserved phase value (referenced for completeness, not the live terminal — `expireCc` returns to `HOLDING_SHARES`).         | `CLOSED` |
| `CC_CLOSED_PROFIT`  | Reserved phase value (referenced for completeness, not produced by any current transition).                                 | `CLOSED` |
| `CC_CLOSED_LOSS`    | Reserved phase value (referenced for completeness, not produced by any current transition).                                 | `CLOSED` |
| `WHEEL_COMPLETE`    | Terminal — the CSP expired worthless, or shares were called away.                                                           | `CLOSED` |

Terminal phases set `status = 'CLOSED'` and stamp `closed_date`; non-terminal
phases leave `status = 'ACTIVE'` and `closed_date = NULL`. The lifecycle
engine itself never writes — it returns the next `phase` and lets the service
update the row. Reserved values are present in the enum because the
phase-rejection test matrix (us-17) parameterises against the full set; live
transitions only produce the phases marked above as terminal exits.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14 -->

## Transitions

The diagram below summarises the legal moves. Each arrow corresponds to one
pure function in `src/main/core/lifecycle.ts`.

```
(new wheel) --openWheel--> CSP_OPEN
                            |
                            |--closeCsp--> CSP_CLOSED_PROFIT | CSP_CLOSED_LOSS
                            |--expireCsp--> WHEEL_COMPLETE
                            |--rollCsp--> CSP_OPEN  (linked ROLL_FROM/ROLL_TO; phase unchanged)
                            |--recordAssignment--> HOLDING_SHARES
                                                    |
                                                    |--openCoveredCall--> CC_OPEN
                                                                           |
                                                                           |--closeCoveredCall--> HOLDING_SHARES
                                                                           |--expireCc--> HOLDING_SHARES
                                                                           |--rollCc--> CC_OPEN  (linked ROLL_FROM/ROLL_TO; phase unchanged)
                                                                           |--recordCallAway--> WHEEL_COMPLETE
```

`HOLDING_SHARES → CC_OPEN → HOLDING_SHARES` is the **CC sub-loop**: the wheel
sells covered call after covered call against the same shares until the shares
are eventually called away. `closeCoveredCall` and `expireCc` keep the wheel
alive (return to `HOLDING_SHARES` with `status='ACTIVE'`); `recordCallAway` is
the terminal exit from the sub-loop. `rollCc` is the in-place CC analogue of
`rollCsp` — phase stays `CC_OPEN` and a linked CALL roll pair is appended.

### `openWheel` — creates `CSP_OPEN`

Creates a brand-new wheel. Validates strike, premium, and that the fill date
is not in the future. On success the service inserts the position row plus the
opening `CSP_OPEN` leg and the initial cost-basis snapshot.

### `closeCsp` — `CSP_OPEN → CSP_CLOSED_PROFIT | CSP_CLOSED_LOSS` (us-4)

Buys the CSP back early.

```typescript
interface CloseCspInput {
  currentPhase: WheelPhase
  closePricePerContract: string
  openPremiumPerContract: string
  closeFillDate: string
  openFillDate: string
  expiration: string
}

interface CloseCspResult {
  phase: 'CSP_CLOSED_PROFIT' | 'CSP_CLOSED_LOSS'
}
```

Validations:

- `currentPhase === 'CSP_OPEN'` else `__phase__` / `invalid_phase`
- `closeFillDate >= openFillDate` else `fillDate` / `close_date_before_open`
- `closeFillDate <= expiration` else `fillDate` / `close_date_after_expiration`
- `closePricePerContract > 0` else `closePricePerContract` / `must_be_positive`

Decision rule: `netPnl = (openPremium − closePrice) × contracts × 100`;
`netPnl.gt(0) ? 'CSP_CLOSED_PROFIT' : 'CSP_CLOSED_LOSS'` — exact breakeven is
classified as a loss. A fill date equal to `expiration` is valid.

The engine receives `openFillDate` and `expiration` as inputs; the service
looks them up from the open leg and passes them in. This is the architectural
contract that keeps the engine DB-free.

### `expireCsp` — `CSP_OPEN → WHEEL_COMPLETE` (us-5)

Records that the CSP expired worthless on or after the expiration date.

```typescript
interface ExpireCspInput {
  currentPhase: WheelPhase
  expirationDate: string // YYYY-MM-DD
  referenceDate: string // YYYY-MM-DD (today or override)
}

interface ExpireCspResult {
  phase: 'WHEEL_COMPLETE'
}
```

Validations:

- `currentPhase === 'CSP_OPEN'` else `__phase__` / `invalid_phase`
- `referenceDate >= expirationDate` else `expiration` / `too_early`

Same-day recording is valid (`referenceDate === expirationDate` passes — US
equity options stop trading Friday). The transition skips any intermediate
`CSP_EXPIRED` state and goes directly to `WHEEL_COMPLETE`. The accompanying
`EXPIRE` leg uses `action='EXPIRE'`, `premium_per_contract='0.0000'`,
`fill_price=NULL`, and `fill_date` set to the option's `expiration` (not "today").

### `recordAssignment` — `CSP_OPEN → HOLDING_SHARES` (us-6)

The broker assigned the put; the trader now holds shares.

```typescript
interface RecordAssignmentInput {
  currentPhase: WheelPhase
  assignmentDate: string // YYYY-MM-DD
  openFillDate: string // YYYY-MM-DD
}

interface RecordAssignmentResult {
  phase: 'HOLDING_SHARES'
}
```

Validations:

- `currentPhase === 'CSP_OPEN'` else `__phase__` / `invalid_phase`
- `assignmentDate >= openFillDate` else `assignmentDate` / `date_before_open`

Notable behaviours:

- **Future dates are NOT rejected.** The "this date is in the future — are
  you sure?" warning is client-side only and non-blocking. Some brokers post
  assignments over the weekend onto a future business day.
- The boundary case `assignmentDate === openFillDate` is valid.
- `position.status` stays `ACTIVE` and `closed_date` stays `NULL` — assignment
  is a phase change, not a close. Only `phase` and `updated_at` move.
- The `ASSIGN` leg is an event marker (like `EXPIRE`); `getPosition.activeLeg`
  returns `null` for `HOLDING_SHARES` positions because the CSP option no
  longer exists as an open contract.

### `openCoveredCall` — `HOLDING_SHARES → CC_OPEN` (us-7)

Sells a call against the held shares.

```typescript
interface OpenCoveredCallInput {
  currentPhase: WheelPhase
  strike: string
  contracts: number
  positionContracts: number // contracts on the ASSIGN leg — caps CC contracts
  premiumPerContract: string
  fillDate: string
  assignmentDate: string // from the ASSIGN leg's fill_date
  referenceDate: string // today
  expiration: string
}

interface OpenCoveredCallResult {
  phase: 'CC_OPEN'
}
```

Validations (engine throws `ValidationError`):

- `currentPhase === 'HOLDING_SHARES'` else `__phase__` / `invalid_phase`
  (message also covers "A covered call is already open on this position" when
  the caller hits `CC_OPEN`, and "This position is closed" for terminal phases)
- `strike > 0` else `strike` / `must_be_positive`
- `premiumPerContract > 0` else `premiumPerContract` / `must_be_positive`
- `contracts <= positionContracts` else `contracts` / `exceeds_shares`
  (message: "Contracts cannot exceed shares held (`{n}`)")
- `fillDate >= assignmentDate` else `fillDate` / `before_assignment`
- `fillDate <= referenceDate` else `fillDate` / `cannot_be_future`

Partial coverage is allowed: `contracts < positionContracts` is accepted with
a UI notice ("`X` of `Y` contracts covered — `Z` shares uncovered"). The
`requirePositiveStrike` / `requirePositivePremium` private helpers are shared
with `openWheel` so the two opening transitions stay in lockstep.

### `closeCoveredCall` — `CC_OPEN → HOLDING_SHARES` (us-8)

Buys the CC back early. The wheel stays alive — phase returns to
`HOLDING_SHARES` and the trader can sell another covered call.

```typescript
interface CloseCoveredCallInput {
  currentPhase: WheelPhase
  closePricePerContract: string
  openFillDate: string // CC_OPEN leg fillDate
  fillDate: string // payload (or today)
  expiration: string // CC_OPEN leg expiration
}

interface CloseCoveredCallResult {
  phase: 'HOLDING_SHARES'
}
```

Validations:

- `currentPhase === 'CC_OPEN'` else `__phase__` / `invalid_phase`
  ("No open covered call on this position")
- `closePricePerContract > 0` else `closePricePerContract` / `must_be_positive`
  ("Close price must be greater than zero")
- `fillDate >= openFillDate` else `fillDate` / `close_date_before_open`
  ("Fill date cannot be before the CC open date")
- `fillDate <= expiration` else `fillDate` / `close_date_after_expiration`
  ("Fill date cannot be after the CC expiration date — use Record Expiry
  instead")

Notable behaviours:

- **`status` stays `ACTIVE` and `closed_date` stays `NULL`.** This is a leg
  closing, not a position closing — the wheel keeps going.
- **No new `cost_basis_snapshots` row is written.** The CC_OPEN snapshot
  already reflected the CC premium reduction; closing the CC does not reverse
  that. Service-layer behaviour: insert the `CC_CLOSE` leg, update
  `position.phase` to `HOLDING_SHARES`, leave snapshots alone.
- The `CC_CLOSE` leg copies strike, expiration, and contracts from the active
  CC_OPEN leg (partial close is not supported in this batch);
  `premium_per_contract = fill_price = closePricePerContract`.
- The `requirePositiveClosePrice(closePricePerContract: string)` private
  helper (us-8 refactor) is now shared with `closeCsp`. Previously each
  function inlined `new Decimal(...).lte(0)` with inconsistent messages
  ("Close price must be positive" vs "Close price must be greater than zero");
  the normalised message is "Close price must be greater than zero".
- The us-10 refactor extracted two additional shared helpers from this
  function — `requireCcOpenPhase()` and `requireFillDateOnOrAfterOpen()` —
  plus the `NO_OPEN_COVERED_CALL_MESSAGE` constant, all now reused by
  `recordCallAway`, `expireCc`, and `rollCc`.

CC leg P&L is computed by the cost-basis engine's `calculateCcClose`
(`(openPremium − closePrice) × contracts × 100`, 4 dp, `ROUND_HALF_UP`) and
returned on the IPC envelope as `ccLegPnl` — derivable from leg history, so
it is not persisted.

### `expireCc` — `CC_OPEN → HOLDING_SHARES` (us-9)

Records that the covered call expired worthless on or after the expiration
date. The wheel stays alive — phase returns to `HOLDING_SHARES`.

```typescript
interface ExpireCcInput {
  currentPhase: WheelPhase
  expirationDate: string // YYYY-MM-DD
  referenceDate: string // YYYY-MM-DD (today or override)
}

interface ExpireCcResult {
  phase: 'HOLDING_SHARES'
}
```

Validations:

- `currentPhase === 'CC_OPEN'` else `__phase__` / `invalid_phase`
  ("No open covered call on this position")
- `referenceDate >= expirationDate` else `expiration` / `too_early`
  ("Cannot record expiration before the expiration date (`{expirationDate}`)" —
  the literal date is interpolated, so the engine receives `expirationDate`
  as a string rather than a comparison value)

Notable behaviours:

- The boundary `referenceDate === expirationDate` is valid (matches
  `expireCsp`).
- **`status` stays `ACTIVE` and `closed_date` stays `NULL`.** CC expiry is a
  leg event, not a position close — distinct from `expireCsp` which lands at
  the terminal `WHEEL_COMPLETE`.
- **No new `cost_basis_snapshots` row is written.** The CC premium was
  captured at CC-open (us-7); expiration is not a financial event.
- The `EXPIRE` leg uses `action='EXPIRE'`, `instrument_type='CALL'`,
  `legRole='CC_EXPIRED'` (us-11), `premium_per_contract='0.0000'`,
  `fill_price=NULL`, and `fill_date` set to the CC's `expiration` (the
  recorded date defaults to expiration, not "today"). Strike, expiration, and
  contracts are copied from the active CC_OPEN leg.
- The renderer surfaces "Record Expiration →" only when
  `phase === 'CC_OPEN' && computeDte(activeLeg.expiration) <= 0`. This is a
  UX guard; the engine remains the authoritative check.

### `recordCallAway` — `CC_OPEN → WHEEL_COMPLETE` (us-10)

The covered call was exercised against the trader; shares are delivered at the
CC strike. This is the terminal exit from the CC sub-loop.

```typescript
interface RecordCallAwayInput {
  currentPhase: WheelPhase
  contracts: number
  fillDate: string // CC_OPEN leg expiration (derived by service)
  ccOpenFillDate: string // CC_OPEN leg fill_date
}

interface RecordCallAwayResult {
  phase: 'WHEEL_COMPLETE'
}
```

Validations:

- `currentPhase === 'CC_OPEN'` else `__phase__` / `invalid_phase`
  ("No open covered call on this position")
- `contracts <= 1` else `contracts` / `multi_contract_unsupported`
  ("Multi-contract call-away is not yet supported")
- `fillDate >= ccOpenFillDate` else `fillDate` / `close_date_before_open`
  ("Fill date cannot be before the CC open date")

Notable behaviours:

- **Fill date and fill price are derived, never user-entered.** The service
  uses `fillDate = ccOpenLeg.expiration` and `fillPrice = ccOpenLeg.strike`.
  The renderer renders the fill-date field read-only with the hint "Derived
  from your CC — the day shares are delivered to the buyer."
- The new leg is written as `legRole='CALLED_AWAY'` (us-11; was emitted as
  `CC_CLOSE` in the original us-10 implementation), `action='EXERCISE'` (new
  enum value added in us-10), `instrument_type='CALL'`,
  `premium_per_contract='0.0000'`. Strike, expiration, and contracts are
  copied from the active CC_OPEN leg.
- A **final cost-basis snapshot** is written, carrying the prior
  `basisPerShare` and `totalPremiumCollected` plus the newly-computed
  `final_pnl`. Snapshots are append-only — the existing CC_OPEN snapshot is
  left intact.
- `position.phase = 'WHEEL_COMPLETE'`, `position.status = 'CLOSED'`,
  `position.closed_date = fillDate` (the CC expiration date).
- Final cycle P&L formula (in `calculateCallAway`): `finalPnl = (ccStrike −
basisPerShare) × sharesHeld`. `basisPerShare` is the **effective** cost
  basis — already reduced by all premiums collected — so `totalPremiumCollected`
  is **not** re-added. `annualizedReturn = (finalPnl / capitalDeployed) × (365
/ cycleDays) × 100`, returning `'0.0000'` when `cycleDays <= 0` to avoid
  divide-by-zero. `cycleDays` is calendar days from `position.openedDate` to
  `fillDate`.
- The IPC response carries `finalPnl`, `cycleDays`, `annualizedReturn`, and
  `basisPerShare` for the success-state hero ("WHEEL COMPLETE" card).

### `rollCsp` — `CSP_OPEN → CSP_OPEN` (us-12, us-13 _planned_)

Closes the current CSP and opens a new one in one atomic operation. **Phase
does not change.** The us-12 baseline supported same-strike "roll out" (later
expiration only); us-13 _(planned, not yet implemented — see note below)_
extends this to allow strike-only or strike-plus-expiration rolls.

```typescript
interface RollCspInput {
  currentPhase: WheelPhase
  currentStrike: string // us-13 (planned)
  newStrike: string // us-13 (planned)
  currentExpiration: string
  newExpiration: string
  costToClosePerContract: number // us-12 — number; us-13 keeps schema unchanged
  newPremiumPerContract: number
}

interface RollCspResult {
  phase: 'CSP_OPEN'
}
```

**As implemented (us-12)** the engine validates:

- `currentPhase === 'CSP_OPEN'` else `__phase__` / `invalid_phase`
  ("Position is not in CSP_OPEN phase")
- `newExpiration > currentExpiration` else `newExpiration` /
  `must_be_after_current`
- `costToClosePerContract > 0` else `costToClosePerContract` / `must_be_positive`
- `newPremiumPerContract > 0` else `newPremiumPerContract` / `must_be_positive`

**Planned us-13 changes (not yet implemented):** the strict `>` check on
`newExpiration` is replaced by a two-part rule so same-expiration strike-only
rolls become valid:

- Reject only when `newStrike === currentStrike AND newExpiration ===
currentExpiration` → `__root__` / `no_change` / "Roll must change the
  expiration, strike, or both"
- Reject when `newExpiration < currentExpiration` → `newExpiration` /
  `must_not_be_earlier` / "New expiration must be after the current expiration"
- Add `requirePositiveDecimal(newStrike, ...)` for positive-strike validation.

The us-12 error `must_be_after_current` is superseded by the us-13 split into
`no_change` (root) and `must_not_be_earlier` (newExpiration). The IPC payload
schema (`RollCspPayloadSchema`) is unchanged by us-13 — `newStrike` was
already declared optional in us-12.

The roll is persisted as a **linked leg pair** with a shared `roll_chain_id`
(reusing the column already on the `legs` table):

- `ROLL_FROM` — `action='BUY'`, `instrument_type='PUT'`, strike and expiration
  copied from the current open leg, `premium_per_contract=costToClosePerContract`.
- `ROLL_TO` — `action='SELL'`, `instrument_type='PUT'`,
  `strike=newStrike ?? currentStrike`, `expiration=newExpiration`,
  `premium_per_contract=newPremiumPerContract`.

Both legs are written in a single `db.transaction()` along with a new
cost-basis snapshot. The `positions` row is **not** updated — phase stays
`CSP_OPEN`, and the new effective "open leg" is the `ROLL_TO`. Because of
this, every "active leg" SQL query (in both `get-position.ts` and
`list-positions.ts`) must resolve `CSP_OPEN → CSP_OPEN | ROLL_TO` (and
`CC_OPEN → CC_OPEN | ROLL_TO`), ordered by `fill_date DESC, created_at DESC`,
to find the most recent open leg after one or more rolls. This resolution is
centralised in `src/main/services/active-leg-sql.ts` (us-12-refactor).

> **us-13 status: planned, not yet implemented.** The us-13 plan dir contains
> only `plan.md`, `research.md`, `data-model.md`, `contracts/`, and
> `quickstart.md` — no `tasks.md` and no `refactor-phase-results.md`. The
> relaxed validation rules and 5-way roll-type label (`Roll Out`, `Roll Down
& Out`, `Roll Up & Out`, `Roll Down`, `Roll Up`) are design intent only.

### `rollCc` — `CC_OPEN → CC_OPEN` (us-14)

Closes the current covered call and opens a new one in one atomic operation.
**Phase does not change.** The CC analogue of `rollCsp` — same architecture,
same linked-pair persistence, but for CALL legs and with relaxed expiration
rules so "Roll Up" / "Roll Down" (same-expiration strike-only) is valid.

```typescript
interface RollCcInput {
  currentPhase: WheelPhase
  currentStrike: string
  currentExpiration: string
  newStrike: string
  newExpiration: string
  costToClosePerContract: number
  newPremiumPerContract: number
}

interface RollCcResult {
  phase: 'CC_OPEN'
}
```

Validations (in order):

- `currentPhase === 'CC_OPEN'` else `__phase__` / `invalid_phase`
  ("No open covered call on this position") — via shared `requireCcOpenPhase`.
- `newExpiration >= currentExpiration` else `newExpiration` /
  `must_be_on_or_after_current` ("New expiration must be on or after the
  current expiration"). Same-expiration rolls are accepted; this is the key
  divergence from `rollCsp`'s strict `>` rule.
- `newStrike === currentStrike AND newExpiration === currentExpiration` →
  `__roll__` / `no_change` ("Roll must change at least one of strike or
  expiration"). Defence-in-depth alongside the renderer's disabled-confirm
  guard.
- `costToClosePerContract > 0` else `costToClosePerContract` /
  `must_be_positive` ("Cost to close must be greater than zero").
- `newPremiumPerContract > 0` else `newPremiumPerContract` / `must_be_positive`
  ("New premium must be greater than zero").

The roll is persisted as a **linked leg pair** with a shared `roll_chain_id`,
identical structure to `rollCsp` but with `instrument_type='CALL'`:

- `ROLL_FROM` — `action='BUY'`, `instrument_type='CALL'`, strike and
  expiration copied from the current open CC leg,
  `premium_per_contract=costToClosePerContract`.
- `ROLL_TO` — `action='SELL'`, `instrument_type='CALL'`,
  `strike=newStrike ?? currentStrike`, `expiration=newExpiration`,
  `premium_per_contract=newPremiumPerContract`.

Both legs plus a new cost-basis snapshot are committed inside a single
`db.transaction()`. The `positions` row is **not** updated — phase stays
`CC_OPEN`. Cost-basis math reuses `calculateRollBasis()` unchanged from
`rollCsp`: `net = newPremium − costToClose`; `basisPerShare = prevBasisPerShare
− net`; `totalPremiumCollected = prevTotalPremiumCollected + (net × contracts ×
100)`.

A renderer-only "below cost basis" warning fires when `newStrike <
basisPerShare`, computed inside `RollCcForm`. It is **non-blocking** — the
confirm button stays enabled. Experienced traders may intentionally sell a CC
below basis in defensive scenarios; the warning is a UX nudge, not a rule.
Active-leg resolution for CC rolls follows the same pattern as CSP rolls:
`CC_OPEN → CC_OPEN | ROLL_TO` via `src/main/services/active-leg-sql.ts`.

<!-- /generated -->

<!-- generated:from us-17 -->

## Roll phase-rejection matrix

The lifecycle engine rejects `rollCsp` from any phase except `CSP_OPEN` and
`rollCc` from any phase except `CC_OPEN`. Both return a `ValidationError` with
`field='__phase__'` and `code='invalid_phase'`. The error messages are:

- `rollCsp` → `"Position is not in CSP_OPEN phase"`
- `rollCc` → `"No open covered call on this position"`

This is enforced at three layers, all driven by the same engine guard:

1. **Engine** — `rollCsp` / `rollCc` in `src/main/core/lifecycle.ts` throw
   immediately on phase mismatch (table-driven test in
   `src/main/core/lifecycle.test.ts`).
2. **Service** — `roll-csp-position.ts` / `roll-cc-position.ts` translate the
   thrown `ValidationError` into the IPC `{ ok: false, errors: [...] }`
   envelope; service-level tests cover all 9 non-rollable phases per direction.
3. **Renderer** — `PositionDetailActions` hides "Roll CSP →" outside
   `CSP_OPEN` and "Roll CC →" outside `CC_OPEN`. UI prevention is the
   user-visible AC; the engine guard is defence-in-depth for programmatic
   callers.

us-17 ships no new production code — it locks the existing US-12 (CSP roll)
and US-14 (CC roll) behaviour with parameterised tests across the full
`WheelPhase` enum.

<!-- /generated -->

<!-- generated:from us-5,us-6,us-8,us-9,us-10,us-11,us-14,us-15 -->

## Leg enums

The lifecycle is encoded into three Zod enums in `src/main/core/types.ts`.
Each transition produces (or consumes) legs whose `legRole`, `action`, and
`instrumentType` follow a fixed pattern. The `legs.roll_chain_id` column
(migration 001) is populated only by the two roll transitions; all other
write-paths set it to `NULL` (us-15).

### `LegAction`

```typescript
LegAction = z.enum(['SELL', 'BUY', 'EXPIRE', 'ASSIGN', 'EXERCISE'])
```

- `SELL` — opening a CSP (`CSP_OPEN`), opening a CC (`CC_OPEN`), or the
  sell side of a roll (`ROLL_TO`, for both `rollCsp` and `rollCc`).
- `BUY` — buying a CSP back to close (`CSP_CLOSE`), buying a CC back to close
  (`CC_CLOSE`, us-8), or the buy side of a roll (`ROLL_FROM`, for both
  `rollCsp` and `rollCc`).
- `EXPIRE` — added in us-5; used for the `EXPIRE` event marker on both CSP
  expiry (us-5; `legRole='EXPIRE'`) and CC expiry (us-9; `legRole='CC_EXPIRED'`
  after us-11). Semantically distinct from `SELL` / `BUY` (no fill occurred).
  No DB `CHECK` constraint enforces `LegAction`, so this was a type-only
  extension.
- `ASSIGN` — added in us-6; used for the `ASSIGN` event marker when shares
  are delivered. Distinct from `BUY` (no market-price purchase happened).
- `EXERCISE` — added in us-10; used exclusively for the `CALLED_AWAY` leg
  when a covered call is exercised against the trader. Distinct from `BUY`
  (the trader did not buy back the contract — it was exercised against them).
  The set is exported as the named constant `LEG_ACTION_VALUES` so the
  `EXERCISE`-enabled list is explicit (us-10 refactor).

### `InstrumentType` (renamed from `OptionType` in us-6)

```typescript
InstrumentType = z.enum(['PUT', 'CALL', 'STOCK'])
```

Renamed from `OptionType` because the `legs` table now also stores stock
events. `STOCK` is used by the `ASSIGN` leg; `PUT` and `CALL` remain in use
for option legs — including the CALL roll pairs written by `rollCc` (us-14).
The column rename is enforced by
`migrations/003_rename_option_type_to_instrument_type.sql`, which also widens
the `CHECK` constraint to include `'STOCK'`.

### `LegRole`

Each transition writes exactly one leg role (or, for `rollCsp` and `rollCc`,
a pair). The us-11 story added the explicit terminal roles `CALLED_AWAY` and
`CC_EXPIRED` so the leg history table can render distinct labels ("Called
Away", "CC Expired") and annotations — previously the call-away path emitted
`CC_CLOSE` and the CC-expiry path emitted a generic `EXPIRE`.

| Transition         | `legRole`               | `action`       | `instrumentType` |
| ------------------ | ----------------------- | -------------- | ---------------- |
| `openWheel`        | `CSP_OPEN`              | `SELL`         | `PUT`            |
| `closeCsp`         | `CSP_CLOSE`             | `BUY`          | `PUT`            |
| `expireCsp`        | `EXPIRE`                | `EXPIRE`       | `PUT`            |
| `recordAssignment` | `ASSIGN`                | `ASSIGN`       | `STOCK`          |
| `openCoveredCall`  | `CC_OPEN`               | `SELL`         | `CALL`           |
| `closeCoveredCall` | `CC_CLOSE`              | `BUY`          | `CALL`           |
| `expireCc`         | `CC_EXPIRED` (us-11)    | `EXPIRE`       | `CALL`           |
| `recordCallAway`   | `CALLED_AWAY` (us-11)   | `EXERCISE`     | `CALL`           |
| `rollCsp`          | `ROLL_FROM` + `ROLL_TO` | `BUY` + `SELL` | `PUT` + `PUT`    |
| `rollCc` (us-14)   | `ROLL_FROM` + `ROLL_TO` | `BUY` + `SELL` | `CALL` + `CALL`  |

### `rollChainId` exposure (us-15)

The `legs.roll_chain_id` column was always written by the two roll services,
but `getPosition` did not surface it. us-15 added `roll_chain_id` to
`GET_LEGS_QUERY`, the `LegRow` DB shape, and `mapLegRow`, then propagated the
field through `LegRecord` (`src/main/schemas.ts`) and the renderer's
`LegDetail` / `LegHistoryEntry` types. The renderer's pure
`buildRollTimeline` (in `src/renderer/src/lib/rollGroups.ts`) consumes
`rollChainId` to group `ROLL_FROM` / `ROLL_TO` pairs into a single visual
section in `LegHistoryTable`, with a numbered "Roll #N" header, indented leg
rows, and a cumulative summary row.

All non-roll service write-paths (`CSP_OPEN`, `ASSIGN`, `CC_CLOSE`,
`CSP_CLOSE`, `CC_EXPIRED`, `EXPIRE`, `CC_OPEN`, `CALLED_AWAY`) construct
`LegRecord` with `rollChainId: null`. Only `roll-csp-position.ts` and
`roll-cc-position.ts` pass a real UUID, and both legs of a pair share it.
`mapActiveLeg` returns `rollChainId: null` even for `ROLL_TO` active legs —
the active-leg payload is used only for the position-header display, never
for timeline grouping.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-12,us-14 -->

## Architectural invariant: the engine is pure

`src/main/core/lifecycle.ts` (and its sibling `src/main/core/costbasis.ts`)
have **no DB or broker imports**. Every transition function takes plain
strings, numbers, and enums and returns a plain result. Date and context
values that live in the database — `openFillDate`, `expiration`,
`assignmentDate`, `positionContracts`, the CC's `openFillDate` and
`expiration` for `closeCoveredCall`, the CC's `expirationDate` for `expireCc`,
the CC's `ccOpenFillDate` and the position's `openedDate` for `recordCallAway`,
the current CC's `currentStrike` and `currentExpiration` for `rollCc` — are
looked up by the service layer **before** calling the engine and passed in as
parameters.

This is enforced by repository convention (see `CLAUDE.md` Architecture
Rules) for a few load-bearing reasons:

- **Testability.** Lifecycle and cost-basis tests run with no database
  fixture — just pass values, assert the result or the thrown
  `ValidationError`. The us-17 phase-rejection matrix relies on this: it
  parameterises across all 10 `WheelPhase` values with zero DB setup at the
  engine layer.
- **Single source of truth.** Phase legality lives in exactly one place. UI
  guards (e.g. "Record Assignment →" only rendered when
  `phase === 'CSP_OPEN'`, "Roll CC →" only rendered when `phase === 'CC_OPEN'`)
  are defence-in-depth, not the real check; the engine rejects the call
  regardless.
- **Immutability of history.** The engine never mutates anything — it
  returns "next phase." Rolls in particular are stored as linked leg pairs
  with a shared `roll_chain_id`, never as in-place updates to the old leg.
  Both `rollCsp` and `rollCc` follow the identical persistence pattern.

Services translate engine results into DB writes inside a single
`db.transaction()` so that the leg(s), the position-row update (if any), and
the new `cost_basis_snapshots` row commit or roll back together.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-9,us-10,us-11,us-12,us-12-refactor,us-13,us-14,us-15,us-17 -->

## Driven by

- [us-4 — Close CSP](../features/us-4-close-csp.md)
- [us-5 — Expire CSP](../features/us-5-expire-csp.md)
- [us-6 — Record Assignment](../features/us-6-record-assignment.md)
- [us-7 — Open Covered Call](../features/us-7-open-covered-call.md)
- [us-8 — Close Covered Call](../features/us-8-close-covered-call.md)
- [us-9 — Expire CC](../features/us-9-expire-cc.md)
- [us-10 — Record Call-Away](../features/us-10-record-call-away.md)
- [us-11 — Distinct Terminal Leg Roles](../features/us-11-terminal-leg-roles.md)
- [us-12 — Roll CSP](../features/us-12-roll-csp.md)
- [us-13 — Roll CSP Strike Flexibility (planned)](../features/us-13-roll-csp-strike.md)
- [us-14 — Roll CC](../features/us-14-roll-cc.md)
- [us-15 — Roll Pair Timeline](../features/us-15-roll-pair-timeline.md)
- [us-17 — Reject Roll on Invalid Phase](../features/us-17-reject-roll-invalid-phase.md)

<!-- /generated -->
