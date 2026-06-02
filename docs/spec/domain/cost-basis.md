# Cost Basis

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-10,us-11,us-12,us-14,us-16,us-33 -->

## Overview

Cost basis tracks a wheel position's effective per-share entry price as
premiums are collected, rolls happen (CSP or CC), assignment lands shares,
covered calls are sold or bought back, and the position closes. It lives in
the **`cost_basis_snapshots`** table, which is **append-only** — every
basis-changing event writes a new row stamped with `snapshot_at`, and the
latest row wins via `ORDER BY snapshot_at DESC LIMIT 1`. The opening
snapshot is never mutated, mirroring the immutable leg-pair pattern used
for rolls.

Snapshots are produced by every lifecycle event that touches basis or P&L:
**opening** (initial CSP), **rolling** (linked ROLL_FROM/ROLL_TO pair —
applies to both CSP and CC rolls), **closing** (early buy-to-close),
**expiring** (worthless), **assignment** (CSP → HOLDING_SHARES), **CC open**
(HOLDING_SHARES → CC_OPEN), and **call-away** (CC_OPEN → WHEEL_COMPLETE on
shares delivered by exercise). Each event calls a pure function in
`src/main/core/costbasis.ts` that returns `basis_per_share`,
`total_premium_collected`, and — only on terminal events — `final_pnl`. All
arithmetic uses `decimal.js` with `ROUND_HALF_UP` at 4 dp via the existing
`round4` helper.

Two lifecycle events deliberately **do not** write a snapshot: a **CC close
early** (CC_OPEN → HOLDING_SHARES) and a **CC expiration**. The CC_OPEN
snapshot already reflects the CC premium reduction; closing or expiring the
short call does not reverse that, and the wheel is still in flight with no
final P&L yet to record. The CC leg's P&L is returned in the IPC envelope
(`ccLegPnl`) but not persisted.

A separate renderer helper `deriveRunningBasis` reconstructs the
per-leg running-basis column on the position detail page by joining the full
snapshot history (`allSnapshots`) against the leg history with a
carry-forward pointer scan. This is a **display derivation**, not engine
math — the canonical "what was the basis as of this leg row?" answer always
comes from `cost_basis_snapshots`.

Alongside the realized snapshot history, the engine also exposes a pure
`computeUnrealizedPnl({ entryPremium, currentMid, contracts })` for **open**
option legs. This is the live mark-to-market P&L of the open short option
itself — not a basis-changing event — and it never writes a snapshot.
Profit-target evaluation uses the same numbers: `resolveProfitTarget` reads
the per-position `positions.profit_target_percent` override (added by
migration `005`) and falls back to `DEFAULT_PROFIT_TARGET_PERCENT = 50` when
`null`.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-10,us-11,us-12,us-14,us-16,us-33 -->

## Key decisions

### Append-only snapshots, latest wins

- **Decision:** Every basis-changing event inserts a new row; the opening
  snapshot is never updated.
- **Why:** Free audit trail; matches the immutable leg-pair pattern; the
  latest row is always retrievable via `ORDER BY snapshot_at DESC LIMIT 1`.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### Cost-basis math lives in a pure engine

- **Decision:** All basis math lives in `src/main/core/costbasis.ts` as pure
  functions; services pass in plain values and persist the result.
- **Why:** Keeps core logic DB- and broker-free and unit-testable; matches
  the lifecycle engine boundary rule.
- **Driven by:** [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)

### `pnl_percentage` is derived, not stored

- **Decision:** Store only `final_pnl`; recompute percentage on display.
- **Why:** Derivable from `final_pnl / total_premium_collected`. Avoids a
  redundant column and a migration.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md)

### Rolls carry basis forward via net credit/debit — branches on `legType` and strike change

- **Decision:** `calculateRollBasis` takes a required `legType: 'CSP' | 'CC'`
  discriminator plus optional `prevStrike` / `newStrike` (required when
  `legType === 'CSP'`). Three formulas, picked by branching on `legType`
  and whether the strike moved:
  - **CC roll (any strike):** `basisPerShare = prevBasisPerShare − net`
  - **CSP roll, same strike:** `basisPerShare = prevBasisPerShare − net`
  - **CSP roll, different strike:**
    `basisPerShare = prevBasisPerShare + (newStrike − prevStrike) − net`

  where `net = newPremium − costToClose` (positive = credit, negative =
  debit). `totalPremiumCollected` always advances by
  `prevTotalPremiumCollected + net × contracts × 100` regardless of branch.
- **Why:** Credit reduces basis, debit raises it. For a CSP, the assignment
  obligation IS the strike — when rolling down from $50 → $47, the future
  liability drops by $3/share and basis must reflect that **immediately**,
  not just at assignment. Ignoring the strike delta on a CSP roll-down
  produces a materially wrong intermediate basis (e.g., $47.70 instead of
  $44.70 in the US-16 scenario). CC strike changes don't move basis because
  the shares are already held — the cost was sealed at assignment time.
- **Driven by:** [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md),
  [us-14 — Roll an open CC](../features/us-14-roll-cc.md),
  [us-16 — Sequential roll basis fix](../features/us-16-cost-basis-sequential-rolls.md)

### Same engine function powers both CSP and CC rolls

- **Decision:** `calculateRollBasis` is the single entry point. The CC roll
  service (`rollCcPosition`) calls it with `legType: 'CC'` and omits the
  strike fields; the CSP roll service (`rollCspPosition`) calls it with
  `legType: 'CSP'` plus `prevStrike` / `newStrike`. No `calculateCcRollBasis`
  exists.
- **Why:** The net-credit/debit math is shared; only the strike-delta branch
  differs. Duplicating the function would split a clean shared formula
  across two callers.
- **Driven by:** [us-14 — Roll an open CC](../features/us-14-roll-cc.md),
  [us-16 — Sequential roll basis fix](../features/us-16-cost-basis-sequential-rolls.md)

### Expiration returns 100% of premium — not a `calculateCspClose` with `closePrice=0`

- **Decision:** A dedicated `calculateCspExpiration({ openPremiumPerContract,
  contracts })` returns `finalPnl = openPremium × contracts × 100` and a
  literal `pnlPercentage = "100.0000"`.
- **Why:** Worthless expiration is the simplest possible terminal event —
  no close price. Reusing `calculateCspClose` with `closePrice=0` would
  distort the percentage math; keeping `pnlPercentage` explicit avoids
  future confusion.
- **Driven by:** [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md)

### Assignment basis nets each roll chain in the service, then walks the engine

- **Decision:** `assignCspPosition` (service layer) groups the position's
  ROLL_FROM/ROLL_TO leg pairs by `roll_chain_id`, computes a **net premium
  per chain** (`ROLL_TO.premium − ROLL_FROM.premium`, signed), and passes
  synthetic `legRole: 'ROLL_NET'` entries to `calculateAssignmentBasis`
  alongside the original `CSP_OPEN` leg. The engine then walks
  `CSP_OPEN + ROLL_NET[]`, subtracting each `premiumPerContract` from
  `strike` to produce `basisPerShare`, `totalPremiumCollected`,
  `sharesHeld`, and a `premiumWaterfall`.
- **Why:** The earlier implementation fed gross `ROLL_TO` premiums to the
  engine without deducting the `ROLL_FROM` cost-to-close, **understating
  the basis** (e.g., $46.50 instead of the correct $47.30 on a $50 CSP
  with $2.00 open premium and a $0.70 net-credit roll). Grouping by chain
  belongs in the service — the engine stays free of roll-pair knowledge
  and remains a leaf with no DB queries.
- **Driven by:** [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md),
  [us-16 — Sequential roll basis fix](../features/us-16-cost-basis-sequential-rolls.md)

### Premium waterfall = one net line per roll, plus the CSP open

- **Decision:** The waterfall renders one entry per `roll_chain_id`:
  `"Roll #N credit: $X"` or `"Roll #N debit: $X"`, never two separate
  ROLL_FROM/ROLL_TO lines. `AssignmentBasisLeg` carries an optional
  `label?: string`; the engine uses `leg.label ?? LEG_ROLE_LABEL[leg.legRole]
  ?? leg.legRole` so the service controls the per-roll display string while
  the engine stays string-format-free.
- **Why:** The AC and assignment-summary mockup both show one line per
  roll. Storing roll-index labelling in the service avoids teaching the
  engine about chain ordering.
- **Driven by:** [us-16 — Sequential roll basis fix](../features/us-16-cost-basis-sequential-rolls.md)

### CC premium reduces basis the same way a roll credit does

- **Decision:** `calculateCcOpenBasis` subtracts `ccPremiumPerContract` from
  `prevBasisPerShare` and adds `ccPremium × contracts × 100` to
  `totalPremiumCollected`. The new snapshot leaves `final_pnl` `null` — the
  wheel is still in flight.
- **Why:** A covered call is a credit, just like a roll. Folding it into
  `calculateAssignmentBasis` would conflate two distinct events.
- **Driven by:** [us-7 — Open covered call](../features/us-7-open-covered-call.md)

### CC close does NOT write a new snapshot

- **Decision:** `calculateCcClose` returns `ccLegPnl = (openPremium −
  closePrice) × contracts × 100` (4 dp), but the service does not insert a
  new `cost_basis_snapshots` row. The existing CC_OPEN snapshot remains the
  current snapshot, and `ccLegPnl` is returned in the IPC envelope only.
- **Why:** The CC_OPEN snapshot already reflects the CC premium reduction;
  closing the short call does not reverse that. The wheel is still ACTIVE
  and the position has no final P&L. Persisting `ccLegPnl` against the
  position would be incorrect for a still-open wheel. CC expiration
  follows the same rule — no snapshot is written.
- **Driven by:** [us-8 — Close a covered call early](../features/us-8-close-covered-call-early.md)

### Call-away uses effective basis directly — premium is not re-added

- **Decision:** `calculateCallAway({ ccStrike, basisPerShare, contracts,
  positionOpenedDate, fillDate })` computes
  `finalPnl = (ccStrike − basisPerShare) × sharesHeld`. The formula never
  re-adds `totalPremiumCollected` because every premium collected across
  the wheel — CSP open, every roll credit, the CC premium — is already
  baked into `basisPerShare`. The same engine call also returns
  `sharesHeld`, `capitalDeployed`, `cycleDays` (calendar days from
  `positionOpenedDate` to `fillDate`), and an `annualizedReturn` that
  falls back to `'0.0000'` when `cycleDays <= 0`.
- **Why:** Re-adding premium would double-count the credit that's
  already reduced the basis row by row. The story's Technical Notes
  spell this out, and the engine wraps it so the call-away service stays
  thin.
- **Driven by:** [us-10 — Record shares called away](../features/us-10-call-away.md)

### Call-away writes a final snapshot — phase becomes WHEEL_COMPLETE

- **Decision:** Call-away inserts a new `cost_basis_snapshots` row that
  carries the prior `basis_per_share` and `total_premium_collected`
  unchanged and populates `final_pnl`. The position row flips to
  `phase = 'WHEEL_COMPLETE'`, `status = 'CLOSED'`, and
  `closed_date = fillDate` (the CC expiration). The existing CC_OPEN
  snapshot is not mutated.
- **Why:** Snapshots are append-only history — the terminal row records
  the final cycle P&L without rewriting the in-flight CC_OPEN basis row.
  `WHEEL_COMPLETE` carries the domain meaning that the wheel cycle has
  closed cleanly via assignment-out, distinct from any other terminal
  label.
- **Driven by:** [us-10 — Record shares called away](../features/us-10-call-away.md)

### Running basis per leg is a renderer derivation, not engine math

- **Decision:** A renderer pure helper
  `deriveRunningBasis(legs, snapshots)` walks legs in `fill_date ASC`
  order while advancing a pointer through snapshots sorted
  `snapshot_at ASC`, recording the last seen `basis_per_share` against
  each leg as `runningCostBasis`. Same-day chains (e.g. assign + open
  CC on the same date) are sequenced so earlier rows keep their own
  basis while later rows inherit the latest snapshot of the day.
  CC_CLOSE legs — which write no snapshot — simply carry forward.
- **Why:** Reconstructing "basis as of this leg row" is a display
  concern, not business logic; placing it in `src/renderer/src/lib/`
  alongside `format.ts` keeps the backend service free of presentation
  logic. The algorithm is O(n+m), needs no look-ahead, and matches the
  existing renderer `lib/` pure-helper pattern.
- **Driven by:** [us-11 — Wheel leg-chain display](../features/us-11-leg-history.md)

### Unrealized P&L for open option legs lives in the engine

- **Decision:** `computeUnrealizedPnl({ entryPremium, currentMid, contracts })`
  is a pure function in `src/main/core/costbasis.ts` that returns `{ pnl,
  pnlPercent, maxProfit }` as 4-dp decimal strings. The renderer imports
  the engine directly (allowed — `src/main/core/` is a leaf with no DB or
  Electron imports) so the live-quote loop can recompute on every snapshot
  without an IPC round-trip.
- **Why:** Keeps the engine convention of decimal-string returns and
  `ROUND_HALF_UP` rounding for every money calculation. The same engine
  owns realized basis math and unrealized P&L math, so the two stay in
  sync (e.g. `maxProfit = entryPremium × contracts × 100` matches the
  CSP-expiration `finalPnl` formula). The sign convention — positive when
  the option has decayed below the entry premium — matches how traders
  read the wheel.
- **Driven by:** [us-33 — Live option mid + unrealized P&L](../features/us-33-option-mid-pnl.md)

### Profit target: hard-coded default + per-position nullable override

- **Decision:** `DEFAULT_PROFIT_TARGET_PERCENT = 50` is a constant in
  `src/main/core/profit-target.ts`. `positions.profit_target_percent`
  (nullable INTEGER, added by migration `005`) holds the per-position
  override. `resolveProfitTarget(override: number | null)` returns the
  override when non-null, else the default — the check is `=== null`, not
  falsy-coalescing, so an explicit `0` is preserved as a real override.
- **Why:** No story currently describes the UX for setting a global
  default, so a constant satisfies every AC today and a future settings
  UI swaps the constant in one place. The per-position override covers
  the "AAPL has a per-position profit target of 25%" scenario without
  introducing an `app_settings` table. The strict `=== null` check is a
  load-bearing detail — `||` would silently treat `0` as "use default".
- **Driven by:** [us-33 — Live option mid + unrealized P&L](../features/us-33-option-mid-pnl.md)

### Previews are computed client-side

- **Decision:** Close P&L, roll net credit/debit (CSP and CC), the CC
  strike-vs-basis guardrail, and the CC close P&L preview are all computed
  in the React form as the user types — no IPC round-trip until submit.
- **Why:** All inputs are already local; instant feedback; no debounce
  needed. The CC guardrail is a non-blocking UX aid, not a business rule.
- **Driven by:** [us-4 — Close a CSP early](../features/us-4-close-csp.md),
  [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md),
  [us-14 — Roll an open CC](../features/us-14-roll-cc.md),
  [us-7 — Open covered call](../features/us-7-open-covered-call.md),
  [us-8 — Close a covered call early](../features/us-8-close-covered-call-early.md)

### CC close % framing: "% of max profit captured" (tastytrade convention)

- **Decision:** The renderer `CcPnlPreview` shows the profit-branch
  percentage as `(openPremium − closePrice) / openPremium × 100` labelled
  `"% of max"`; the loss branch shows
  `(closePrice − openPremium) / openPremium × 100` labelled
  `"% above open"`. This is the canonical % framing for any CC P&L
  display, even though the math lives in the renderer rather than the
  engine.
- **Why:** "% of max profit captured" is the industry-standard,
  tastytrade-popularised framing wheel traders use to apply the
  50%-of-max close rule. The earlier formula
  (`closePrice / openPremium × 100`, "% of premium returned") produces
  the same value only at the exact 50% midpoint and would silently
  display a wrong number anywhere else.
- **Driven by:** [us-8 — Close a covered call early](../features/us-8-close-covered-call-early.md)

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-10,us-11,us-12,us-14,us-16,us-33 -->

## Cost basis on each lifecycle event

Each event inserts one new row into `cost_basis_snapshots` **unless noted
otherwise**. Money values are TEXT, 4 dp, rounded with `ROUND_HALF_UP` via
the `round4` helper.

### CSP open

Not yet documented in extracts. Implementation: `calculateInitialCspBasis` in
`src/main/core/costbasis.ts`.

### CSP close (early buy-to-close)

Formula (per-contract math, scaled to total):

```
finalPnl = (openPremium − closePrice) × contracts × 100
```

Snapshot row written:

| Column                    | Value                                                   |
| ------------------------- | ------------------------------------------------------- |
| `basis_per_share`         | copied from the opening snapshot (unchanged)            |
| `total_premium_collected` | copied from the opening snapshot (unchanged)            |
| `final_pnl`               | `(openPremium − closePrice) × contracts × 100` (4 dp)   |
| `annualized_return`       | `NULL` (future story)                                   |
| `snapshot_at`             | now                                                     |

Breakeven (`finalPnl = 0`) is classified as `CSP_CLOSED_LOSS`, not profit.
`pnlPercentage` is per-contract: total P&L scales with contracts, percentage
does not.

### CSP expiration (worthless)

Formula:

```
finalPnl       = openPremium × contracts × 100
pnlPercentage  = "100.0000"   (literal constant)
```

Snapshot row written:

| Column                    | Value                                                   |
| ------------------------- | ------------------------------------------------------- |
| `basis_per_share`         | copied from the most recent prior snapshot              |
| `total_premium_collected` | copied from the most recent prior snapshot              |
| `final_pnl`               | equals `total_premium_collected` (100% captured)        |
| `snapshot_at`             | `now + 1ms` (sorts strictly after the opening snapshot) |

`pnlPercentage` is kept explicit (`"100.0000"`) rather than derived to avoid
future confusion. The expire leg's `premium_per_contract` is `'0.0000'`
(expired worthless) and `fill_price` is `NULL` (no fill ever occurred).

### CSP roll

`calculateRollBasis` is called with `legType: 'CSP'`, `prevStrike`, and
`newStrike`. Let `net = newPremium − costToClose` (positive = credit). The
basis formula branches on whether the strike moved:

```
# Same-strike CSP roll (legacy formula):
basisPerShare = prevBasisPerShare − net

# Different-strike CSP roll (strike-delta formula):
basisPerShare = prevBasisPerShare + (newStrike − prevStrike) − net
```

In both branches:

```
totalPremiumCollected = prevTotalPremiumCollected + net × contracts × 100
```

Option contracts are already per-share, so `netPerShare = net` directly
(a roll with `net = 0.10` reduces basis by $0.10/share). On a debit roll,
`net` is negative, raising basis and reducing `total_premium_collected`.
On a roll-down (e.g., $50 → $47), the `+ (newStrike − prevStrike)` term is
negative, dropping basis by the strike delta — matching the reduced
assignment liability immediately rather than waiting for assignment.

Worked example (US-16 roll-down, $50 → $47, net credit $0.70):

```
prevBasisPerShare = $48.00   (prior basis after earlier same-strike roll)
strike delta      = $47 − $50 = −$3.00
basisPerShare     = $48.00 + (−$3.00) − $0.70 = $44.30
```

Snapshot row written:

| Column                    | Value                                            |
| ------------------------- | ------------------------------------------------ |
| `basis_per_share`         | per branch above (4 dp)                          |
| `total_premium_collected` | `prevTotalPremiumCollected + net × contracts × 100` (4 dp) |
| `final_pnl`               | `NULL` (position remains open)                   |
| `snapshot_at`             | now                                              |

The position row is **not** updated on a roll — phase stays `CSP_OPEN`,
`status` stays `ACTIVE`. The new ROLL_TO leg becomes the effective open leg.

### CC roll

`calculateRollBasis` is called with `legType: 'CC'`. Strike fields are
ignored — the shares are already held, so a CC strike change does not move
share basis. Let `net = newPremium − costToClose` (positive = credit):

```
basisPerShare         = prevBasisPerShare − net
totalPremiumCollected = prevTotalPremiumCollected + net × contracts × 100
```

Snapshot row written:

| Column                    | Value                                            |
| ------------------------- | ------------------------------------------------ |
| `basis_per_share`         | `prevBasisPerShare − net` (4 dp)                 |
| `total_premium_collected` | `prevTotalPremiumCollected + net × contracts × 100` (4 dp) |
| `final_pnl`               | `NULL` (position remains open)                   |
| `snapshot_at`             | now                                              |

The position row is **not** updated on a CC roll — phase stays `CC_OPEN`,
`status` stays `ACTIVE`. ROLL_FROM (BUY CALL) and ROLL_TO (SELL CALL) legs
are inserted as a linked pair sharing a new `roll_chain_id`; `instrument_type`
is `'CALL'` for both. The ROLL_TO leg becomes the effective open CC.

### Assignment (CSP_OPEN → HOLDING_SHARES)

The service (`assignCspPosition`) first groups the position's legs by
`roll_chain_id`, ordered by `fill_date`, and computes one synthetic
`ROLL_NET` entry per roll chain:

```
roll #N net = ROLL_TO.premium − ROLL_FROM.premium    (signed)
label       = 'Roll #N credit'  if net >= 0
              'Roll #N debit'   if net <  0
```

It then calls `calculateAssignmentBasis` with the original `CSP_OPEN` leg
plus the `ROLL_NET` entries (no raw `ROLL_TO` or `ROLL_FROM` legs reach the
engine):

```
basisPerShare         = strike − Σ(premiumPerContract)   over CSP_OPEN + ROLL_NET
totalPremiumCollected = Σ(premiumPerContract × leg.contracts × 100)
sharesHeld            = contracts × 100
premiumWaterfall      = [{ label, amount } per CSP_OPEN + ROLL_NET entry]
```

`label` on the waterfall is `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ??
leg.legRole`, so `CSP_OPEN` becomes `'CSP premium'` (via the default
mapping) and each `ROLL_NET` entry carries the service-supplied
`'Roll #N credit'` / `'Roll #N debit'` string. The waterfall is returned by
the engine (not derived in the renderer) so each deduction line can be
rendered individually in the assignment summary card.

Worked example (US-16 AC4 — CSP at $50, $2.00 open, one net-credit roll):

```
CSP_OPEN  premium = $2.00
Roll #1   net     = ROLL_TO ($1.50) − ROLL_FROM ($0.80) = $0.70  → 'Roll #1 credit'
basisPerShare     = $50 − $2.00 − $0.70 = $47.30
```

Snapshot row written:

| Column                    | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `basis_per_share`         | `strike − Σ(premiumPerContract)` over CSP_OPEN + ROLL_NET (4 dp) |
| `total_premium_collected` | `Σ(premiumPerContract × leg.contracts × 100)` (4 dp)          |
| `final_pnl`               | `NULL` (position still open — phase changes, status `ACTIVE`) |
| `annualized_return`       | `NULL` (future story)                                         |
| `snapshot_at`             | now                                                           |

The position keeps `status='ACTIVE'` and `closed_date=NULL`; only `phase`
and `updated_at` change. The ASSIGN leg is an event marker (like EXPIRE) —
`getPosition.activeLeg` returns `null` for `HOLDING_SHARES` positions
because the CSP option no longer exists as an open leg.

### Covered call open (HOLDING_SHARES → CC_OPEN)

Formula:

```
basisPerShare         = prevBasisPerShare − ccPremiumPerContract
totalPremiumCollected = prevTotalPremiumCollected + (ccPremium × contracts × 100)
```

Snapshot row written:

| Column                    | Value                                                       |
| ------------------------- | ----------------------------------------------------------- |
| `basis_per_share`         | `prevBasisPerShare − ccPremiumPerContract` (4 dp)           |
| `total_premium_collected` | `prevTotal + (ccPremium × contracts × 100)` (4 dp)          |
| `final_pnl`               | `NULL` (position still open)                                |
| `snapshot_at`             | now                                                         |

The position row's `phase` flips to `CC_OPEN`; `status` stays `ACTIVE`. The
strike-vs-basis guardrail (warn when CC strike ≤ basis) is a client-side
display helper only — the engine does not reject below-basis strikes.

### Covered call close (CC_OPEN → HOLDING_SHARES) — no new snapshot

Formula (CC leg P&L only — returned, not persisted):

```
ccLegPnl = (openPremium − closePrice) × contracts × 100   (4 dp)
```

**No `cost_basis_snapshots` row is written.** The existing CC_OPEN snapshot
remains current. The service returns `ccLegPnl` in the IPC envelope so the
renderer's success-state hero card can display `+$X.XX` / `−$X.XX`, but the
number is never stored against the position — the wheel is still ACTIVE
and has no final P&L.

The position row's `phase` flips back to `HOLDING_SHARES`; `status` stays
`ACTIVE`, `closed_date` stays `NULL`. A single `CC_CLOSE` / `BUY` / `CALL`
leg is inserted (strike, expiration, and contracts copied from the active
CC_OPEN leg; `premium_per_contract` and `fill_price` both set to the close
price). Partial CC close is not supported.

The renderer's `CcPnlPreview` computes the displayed percentage with the
same `(openPremium − closePrice) × contracts × 100` total but applies a
different label depending on direction:

| Branch                                 | Formula                                              | Label             | Tone    |
| -------------------------------------- | ---------------------------------------------------- | ----------------- | ------- |
| `closePrice < openPremium` (profit)    | `(openPremium − closePrice) / openPremium × 100`     | `% of max`        | green   |
| `closePrice > openPremium` (loss)      | `(closePrice − openPremium) / openPremium × 100`     | `% above open`    | red     |
| `closePrice == openPremium`            | n/a                                                  | `$0.00 break-even`| neutral |

`% of max` is the tastytrade-style "% of max profit captured" — what wheel
traders use to apply the 50%-of-max close rule. Worked example with
`openPremium = $2.30`: `closePrice = $1.10` → `+$120.00 · 52.2% of max`;
`closePrice = $1.15` (exact 50% midpoint) → `+$115.00 · 50.0% of max`.

### Covered call expiration — no new snapshot

CC expiration (the short call finishes out-of-the-money and expires
worthless) also leaves `cost_basis_snapshots` untouched, for the same
reason as CC close: the CC premium reduction is already baked into the
current CC_OPEN snapshot, and the wheel is still ACTIVE. The trader keeps
the shares and may open another covered call.

Note: with us-11, CC expiration now persists `legRole = 'CC_EXPIRED'`
(previously a generic `EXPIRE`) so the leg-history renderer can label the
row distinctly. The basis math is unchanged.

### Call-away (CC_OPEN → WHEEL_COMPLETE)

Terminal event — the short covered call is exercised at expiration and
shares are delivered at the CC strike. Formula:

```
sharesHeld        = contracts × 100
finalPnl          = (ccStrike − basisPerShare) × sharesHeld
capitalDeployed   = basisPerShare × sharesHeld
cycleDays         = calendar days, positionOpenedDate → fillDate
annualizedReturn  = (finalPnl / capitalDeployed) × (365 / cycleDays) × 100
                    (falls back to '0.0000' when cycleDays <= 0)
```

`basisPerShare` is the **effective** basis from the latest snapshot —
already net of every premium collected across the wheel. The formula
does not re-add `total_premium_collected`. A call-away below cost basis
yields a negative `finalPnl`.

Snapshot row written:

| Column                    | Value                                                         |
| ------------------------- | ------------------------------------------------------------- |
| `basis_per_share`         | copied from the prior (CC_OPEN) snapshot                      |
| `total_premium_collected` | copied from the prior (CC_OPEN) snapshot                      |
| `final_pnl`               | `(ccStrike − basisPerShare) × sharesHeld` (4 dp, signed)      |
| `snapshot_at`             | now                                                           |

The position row flips to `phase = 'WHEEL_COMPLETE'`,
`status = 'CLOSED'`, and `closed_date = fillDate` (the CC expiration).
A single `CC_CLOSE` leg is inserted with `action = 'EXERCISE'`,
`premium_per_contract = '0.0000'`, `fill_price = ccStrike`, and
`fill_date = ccOpenLeg.expiration` — fill date and price are derived
from the active CC_OPEN leg, never user-entered. With us-11 the leg's
`leg_role` is persisted as `CALLED_AWAY` (distinct from `CC_CLOSE`) so
the leg-history view can render the "Called Away" row label.

Multi-contract call-away is rejected at the lifecycle layer
(`contracts <= 1`); fill date before the CC open date is rejected as
`close_date_before_open`. `WHEEL_COMPLETE` is terminal — no further
phase transitions are valid.

### Running basis per leg (renderer derivation)

The position detail page's leg history shows a `Running Basis / Share`
column. Values are not stored — they are derived in the renderer by
joining the position's full snapshot history against the leg list:

```
deriveRunningBasis(legs, snapshots):
  currentBasis = null
  si = 0
  for each leg in legs (sorted fill_date ASC):
    while si < snapshots.length AND snapshots[si].snapshotAt.slice(0,10) <= leg.fillDate:
      currentBasis = snapshots[si].basisPerShare
      si++
    leg.runningCostBasis = currentBasis
```

Snapshots arrive sorted `snapshot_at ASC` from the backend as
`allSnapshots` on the `positions:get` response. The pointer scan is
O(n+m) with no look-ahead. CC_CLOSE legs — which by design never write
a snapshot — carry forward the prior CC_OPEN basis. Same-day chains
(assign + open CC on the same date) are sequenced so earlier rows keep
their own basis while later rows inherit the day's latest snapshot.

The mapping from leg role to whether a snapshot exists at that row:

| Leg Role    | Writes snapshot? | `final_pnl` set? |
| ----------- | ---------------- | ---------------- |
| CSP_OPEN    | Yes              | No               |
| ASSIGN      | Yes              | No               |
| CC_OPEN     | Yes              | No               |
| CC_CLOSE    | **No**           | N/A              |
| CC_EXPIRED  | Yes              | Yes (terminal)   |
| CALLED_AWAY | Yes              | Yes (terminal)   |
| ROLL_FROM   | No               | N/A              |
| ROLL_TO     | Yes (one per roll pair) | No        |

(ROLL_TO is the leg row that bears the new snapshot from
`calculateRollBasis`; ROLL_FROM is a paired marker only.)

### Unrealized P&L for open option legs (no snapshot)

Live mark-to-market P&L for an open CSP or CC. Not a lifecycle event —
no snapshot is written and no DB column is touched. The renderer polls
the option snapshot every 60 s (REST, disabled when market is closed)
and calls the engine directly on each tick.

Formula (per-contract math, scaled to total):

```
maxProfit  = entryPremium × contracts × 100
pnl        = (entryPremium − currentMid) × contracts × 100
pnlPercent = (pnl / maxProfit) × 100
```

Sign convention: positive when the option has decayed below the entry
premium (the trader's winning direction on a short option). All three
values are returned as 4-dp decimal strings via `Decimal.toFixed(4)`.

Validation rejects inputs outside the open-short-option domain:

- `entryPremium > 0` — a short option always sells for some credit
- `currentMid >= 0` — a mid of `0` is valid (deep OTM near expiry)
- `contracts` integer ≥ 1

Profit-target evaluation reads from the same numbers. The default
threshold is `DEFAULT_PROFIT_TARGET_PERCENT = 50`; a per-position
override lives in `positions.profit_target_percent` (nullable INTEGER,
migration `005`). The resolver:

```typescript
resolveProfitTarget(override: number | null): number
  // override === null ? DEFAULT_PROFIT_TARGET_PERCENT : override
```

The `=== null` check is deliberate — `||` would silently treat an
explicit `0` override as "use default". The target-reached predicate
itself (`pnlPercent >= resolveProfitTarget(override)`) runs in the
renderer to avoid an IPC round-trip on every quote update; the engine
exposes the building blocks but does not gate the badge.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-10,us-11,us-12,us-14,us-16,us-33 -->

## Function signatures

Pure entry points in `src/main/core/costbasis.ts`. All money fields are 4-dp
TEXT strings; `contracts` is a number.

```typescript
// Opening — initial CSP basis
export function calculateInitialCspBasis(leg: CspLegInput): CostBasisResult

// Close — early buy-to-close P&L
export interface CspCloseInput {
  openPremiumPerContract: string
  closePricePerContract:  string
  contracts:              number
}
export interface CspCloseResult {
  finalPnl:       string
  pnlPercentage:  string
}
export function calculateCspClose(input: CspCloseInput): CspCloseResult

// Expiration — worthless, 100% captured
export interface CspExpirationInput {
  openPremiumPerContract: string
  contracts:              number
}
export interface CspExpirationResult {
  finalPnl:       string   // 4 dp TEXT
  pnlPercentage:  string   // constant '100.0000'
}
export function calculateCspExpiration(input: CspExpirationInput): CspExpirationResult

// Roll — basis carry-forward, shared by CSP and CC services.
// CSP callers MUST supply prevStrike + newStrike; CC callers OMIT them.
export interface RollBasisInput {
  prevBasisPerShare:         string
  prevTotalPremiumCollected: string
  costToClosePerContract:    string
  newPremiumPerContract:     string
  contracts:                 number
  legType:                   'CSP' | 'CC'
  prevStrike?:               string   // required when legType === 'CSP'
  newStrike?:                string   // required when legType === 'CSP'
}
export interface RollBasisResult {
  basisPerShare:         string
  totalPremiumCollected: string
}
export function calculateRollBasis(input: RollBasisInput): RollBasisResult

// Assignment — basis after CSP → HOLDING_SHARES, with premium waterfall.
// The service pre-nets each roll chain into a synthetic 'ROLL_NET' entry
// before calling this — raw ROLL_FROM/ROLL_TO premiums are never passed in.
export interface AssignmentBasisLeg {
  legRole:            string    // 'CSP_OPEN' | 'ROLL_NET' (post-US-16)
  premiumPerContract: string    // signed: ROLL_NET can be negative on debit rolls
  contracts:          number
  label?:             string    // optional display override for waterfall line
}
export interface AssignmentBasisInput {
  strike:       string
  contracts:    number
  premiumLegs:  AssignmentBasisLeg[]
}
export interface AssignmentBasisResult {
  basisPerShare:         string
  totalPremiumCollected: string
  sharesHeld:            number
  premiumWaterfall:      Array<{ label: string; amount: string }>
}
export function calculateAssignmentBasis(input: AssignmentBasisInput): AssignmentBasisResult

// CC open — credit reduces basis, accumulates into total premium
export interface CcOpenBasisInput {
  prevBasisPerShare:         string
  prevTotalPremiumCollected: string
  ccPremiumPerContract:      string
  contracts:                 number
}
export interface CcOpenBasisResult {
  basisPerShare:         string   // 4 dp
  totalPremiumCollected: string   // 4 dp
}
export function calculateCcOpenBasis(input: CcOpenBasisInput): CcOpenBasisResult

// CC close — CC leg P&L, NOT a new snapshot
export interface CcCloseInput {
  openPremiumPerContract: string
  closePricePerContract:  string
  contracts:              number
}
export interface CcCloseResult {
  ccLegPnl: string   // 4 dp, e.g. "120.0000" or "-120.0000"
}
export function calculateCcClose(input: CcCloseInput): CcCloseResult

// Call-away — terminal: shares delivered at the CC strike
export interface CallAwayInput {
  ccStrike:           string   // from CC_OPEN leg
  basisPerShare:      string   // from latest cost_basis_snapshot
  contracts:          number   // from CC_OPEN leg
  positionOpenedDate: string   // position.openedDate
  fillDate:           string   // CC expiration date
}
export interface CallAwayResult {
  finalPnl:         string   // 4 dp, signed
  sharesHeld:       number   // contracts × 100
  capitalDeployed: string    // basisPerShare × sharesHeld, 4 dp
  cycleDays:        number   // calendar days, openedDate → fillDate
  annualizedReturn: string   // 4 dp; '0.0000' if cycleDays <= 0
}
export function calculateCallAway(input: CallAwayInput): CallAwayResult
```

Shared helpers also live in `src/main/core/costbasis.ts`:
`SHARES_PER_CONTRACT`, `sharesFromContracts()`, and `calculateCycleDays()`
— reused by call-away and other cost-basis math. A
`LEG_ROLE_LABEL` map maps known `legRole` values to default waterfall
labels (e.g., `CSP_OPEN → 'CSP premium'`); per-leg `label` overrides take
precedence.

```typescript
// Unrealized P&L — live mark-to-market for an open short option leg.
// Pure; no snapshot is written. Imported directly by the renderer.
export interface UnrealizedPnlInput {
  entryPremium: string   // dollars-per-contract, e.g. '3.50'
  currentMid:   string   // dollars-per-contract, e.g. '1.30'
  contracts:    number   // positive integer
}
export interface UnrealizedPnlResult {
  pnl:        string     // dollars total, 4 dp ('220.0000')
  pnlPercent: string     // 0–100 scale, 4 dp ('62.8571')
  maxProfit:  string     // dollars total, 4 dp ('350.0000')
}
export function computeUnrealizedPnl(input: UnrealizedPnlInput): UnrealizedPnlResult
```

Profit-target resolver lives in `src/main/core/profit-target.ts`:

```typescript
export const DEFAULT_PROFIT_TARGET_PERCENT = 50

// Returns the override when non-null (including explicit 0), else the default.
export function resolveProfitTarget(override: number | null): number
```

### Service-layer roll-chain grouping

`assignCspPosition` in `src/main/services/assign-csp-position.ts` owns a
private `groupRollsByChain` helper. It walks the position's legs ordered
by `fill_date`, groups `ROLL_FROM` and `ROLL_TO` legs by
`roll_chain_id`, and emits one `AssignmentBasisLeg` per chain with
`legRole: 'ROLL_NET'`, `premiumPerContract = ROLL_TO.premium −
ROLL_FROM.premium` (signed), and a `label` of `'Roll #N credit'` or
`'Roll #N debit'`. This helper is intentionally co-located rather than
shared — no other service needs it today.

### Renderer derivation: `deriveRunningBasis`

Pure helper in `src/renderer/src/lib/deriveRunningBasis.ts`. Not part of
the core engine — this is display logic.

```typescript
type SnapshotInput = { snapshotAt: string; basisPerShare: string }

export function deriveRunningBasis<T extends { fillDate: string }>(
  legs:      T[],
  snapshots: SnapshotInput[]
): Array<T & { runningCostBasis: string | null }>
```

Inputs are the position's legs (sorted `fill_date ASC`) and full snapshot
history (sorted `snapshot_at ASC`, exposed by `getPosition` as
`allSnapshots`). Returns the same legs enriched with `runningCostBasis`,
the latest `basis_per_share` whose `snapshot_at.slice(0,10) <= fillDate`
— or `null` if no snapshot has been seen yet at that point. Same-day
multi-leg chains are sequenced so earlier rows keep their own basis
while later rows inherit the latest snapshot of the day.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-10,us-11,us-12,us-14,us-16,us-33 -->

## Snapshot row reference

`cost_basis_snapshots` columns (from `migrations/001_initial_schema.sql`,
extended by `migrations/004_add_trigger_event_to_snapshots.sql`):

| Column                    | Type          | When set                                            | When null                       |
| ------------------------- | ------------- | --------------------------------------------------- | ------------------------------- |
| `id`                      | TEXT (UUID)   | always — new UUID per row                           | never                           |
| `position_id`             | TEXT FK       | always — parent position                            | never                           |
| `basis_per_share`         | TEXT (4 dp)   | always — effective basis after the event            | never                           |
| `total_premium_collected` | TEXT (4 dp)   | always — running total across the chain             | never                           |
| `final_pnl`               | TEXT (4 dp)   | set on terminal events (close, expiry, call-away)   | open snapshots, rolls, assignment, CC open |
| `annualized_return`       | TEXT          | future story — reserved                             | always today                    |
| `trigger_event`           | TEXT          | always — which lifecycle event produced this row    | never (defaults to `'UNKNOWN'`) |
| `snapshot_at`             | TEXT (ISO)    | always — event timestamp; used for latest-row sort  | never                           |
| `created_at`              | TEXT (ISO)    | always — insert timestamp                           | never                           |

Latest-row selector pattern used everywhere:

```sql
SELECT * FROM cost_basis_snapshots
WHERE position_id = ?
ORDER BY snapshot_at DESC
LIMIT 1
```

Note: the expiration snapshot uses `snapshot_at = now + 1ms` so it sorts
strictly after the opening snapshot in the same `ORDER BY snapshot_at DESC`
query.

Events that **do not** insert a row: CC close early, CC expiration. Their
P&L is returned in the IPC envelope (`ccLegPnl`) but not persisted — the
CC_OPEN snapshot remains current until the wheel reaches a terminal event.

Unrealized P&L for an open option leg (`computeUnrealizedPnl`) is also
**not** persisted — it's a renderer-driven live calculation on every
quote tick, with no DB column. Only realized basis and terminal P&L
land in `cost_basis_snapshots`.

<!-- /generated -->

<!-- generated:from us-4,us-5,us-6,us-7,us-8,us-8-pct-fix,us-10,us-11,us-12,us-14,us-16,us-33 -->

## Driven by

- [us-4 — Close a CSP early](../features/us-4-close-csp.md)
- [us-5 — Record CSP expiration](../features/us-5-record-csp-expiration.md)
- [us-6 — Record CSP assignment](../features/us-6-record-csp-assignment.md)
- [us-7 — Open covered call](../features/us-7-open-covered-call.md)
- [us-8 — Close a covered call early](../features/us-8-close-covered-call-early.md)
- [us-10 — Record shares called away](../features/us-10-call-away.md)
- [us-11 — Wheel leg-chain display](../features/us-11-leg-history.md)
- [us-12 — Roll an open CSP out](../features/us-12-roll-csp.md)
- [us-14 — Roll an open covered call](../features/us-14-roll-cc.md)
- [us-16 — Sequential roll basis fix](../features/us-16-cost-basis-sequential-rolls.md)
- [us-33 — Live option mid + unrealized P&L](../features/us-33-option-mid-pnl.md)

<!-- /generated -->

<!-- Hand-written sections below this line are preserved across regeneration. -->
