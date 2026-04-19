# Data Model: US-16 — Cost Basis After Sequential Rolls

No new database tables or columns are required. This story corrects calculation logic only.

---

## Modified: `RollBasisInput` (interface in `src/main/core/costbasis.ts`)

Current:

```typescript
export interface RollBasisInput {
  prevBasisPerShare: string
  prevTotalPremiumCollected: string
  costToClosePerContract: string
  newPremiumPerContract: string
  contracts: number
}
```

After this story:

```typescript
export interface RollBasisInput {
  prevBasisPerShare: string
  prevTotalPremiumCollected: string
  costToClosePerContract: string
  newPremiumPerContract: string
  contracts: number
  legType: 'CSP' | 'CC'
  prevStrike?: string // required when legType === 'CSP'
  newStrike?: string // required when legType === 'CSP'
}
```

**Validation rules:**

- `legType` is always required.
- `prevStrike` and `newStrike` are required when `legType === 'CSP'`; ignored for `legType === 'CC'`.
- When `prevStrike === newStrike`, use the simple formula (`prevBasis - netCredit`); when they differ, use the strike-delta formula.

---

## Modified: `AssignmentBasisLeg` (interface in `src/main/core/costbasis.ts`)

Current:

```typescript
export interface AssignmentBasisLeg {
  legRole: string
  premiumPerContract: string
  contracts: number
}
```

After this story:

```typescript
export interface AssignmentBasisLeg {
  legRole: string
  premiumPerContract: string
  contracts: number
  label?: string // optional display override for waterfall line
}
```

The engine uses `leg.label ?? LEG_ROLE_LABEL[leg.legRole] ?? leg.legRole` for waterfall display.

---

## Calculation Logic Changes

### `calculateRollBasis` — branch by leg type and strike

```
netCredit = newPremiumPerContract − costToClosePerContract

if legType === 'CC' OR (legType === 'CSP' AND newStrike === prevStrike):
    newBasis = prevBasis − netCredit

if legType === 'CSP' AND newStrike ≠ prevStrike:
    newBasis = prevBasis + (newStrike − prevStrike) − netCredit

newTotalPremium = prevTotalPremium + (netCredit × contracts × 100)
```

This formula applies per-share for `newBasis`, and per-position for `newTotalPremium`.

### `calculateAssignmentBasis` — waterfall label override

No change to the numeric calculation. The `label` field on `AssignmentBasisLeg` is used only for waterfall display. The service layer pre-computes net roll credits and passes them — the engine sums whatever `premiumPerContract` values are supplied.

---

## Service Layer: Roll-Net Grouping in `assignCspPosition`

The service groups all ROLL_TO and ROLL_FROM legs by `roll_chain_id` (sorted by `fill_date ASC`), computing the net credit per roll pair. Each net is passed as a `legRole: 'ROLL_NET'` entry:

```typescript
// Synthetic entry produced by the service (not stored in DB)
{
  legRole: 'ROLL_NET',
  premiumPerContract: '0.70',   // ROLL_TO.premium − ROLL_FROM.premium (can be negative for debit)
  contracts: 1,
  label: 'Roll #1 credit'       // or 'Roll #1 debit' if negative
}
```

The `strike` passed to `calculateAssignmentBasis` is `activeLeg.strike` — the ROLL_TO leg's strike after the final roll (already correct in the current service code).

---

## Snapshot Chain (no schema changes)

Each roll already creates one `cost_basis_snapshots` row. Assignment creates one. CC open creates one. CC roll creates one. For a full lifecycle (CSP open, 2 CSP rolls, assignment, CC open, 1 CC roll), 6 snapshots exist, ordered by `snapshot_at ASC`. The `getPosition` service returns only the latest snapshot; counting all snapshots requires a direct DB query or a new query in the service.
