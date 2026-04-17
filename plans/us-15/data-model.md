# Data Model: US-15 — Roll Pair Display in Leg Timeline

## Renderer-Only Story — No New DB Schema

No migrations or new tables. `roll_chain_id` already exists in the `legs` table (migration 001). The only model change is exposing this field through `getPosition`.

---

## Backend Change: `LegRecord` Gains `rollChainId`

### `src/main/schemas.ts` — `LegRecord`

| Field (current)    | Type               | Notes                                              |
| ------------------ | ------------------ | -------------------------------------------------- |
| id                 | string             |                                                    |
| positionId         | string             |                                                    |
| legRole            | LegRole            |                                                    |
| action             | LegAction          |                                                    |
| instrumentType     | InstrumentType     |                                                    |
| strike             | string             |                                                    |
| expiration         | string             |                                                    |
| contracts          | number             |                                                    |
| premiumPerContract | string             |                                                    |
| fillPrice          | string \| null     |                                                    |
| fillDate           | string             |                                                    |
| createdAt          | string             |                                                    |
| updatedAt          | string             |                                                    |
| **rollChainId**    | **string \| null** | **NEW — shared UUID for ROLL_FROM + ROLL_TO pair** |

### `src/main/services/get-position.ts` changes

- `LegRow` interface: add `roll_chain_id: string | null`
- `GET_LEGS_QUERY`: add `roll_chain_id` to SELECT
- `mapLegRow`: add `rollChainId: r.roll_chain_id ?? null`

---

## Renderer Types

### `src/renderer/src/api/positions.ts` — `LegDetail`

Add `rollChainId: string | null` to the existing `LegDetail` type (no IPC contract file needed — same channel, additional field).

### `src/renderer/src/components/LegHistoryTable.tsx` — `LegHistoryEntry`

Add `rollChainId: string | null`.

---

## New Pure Data Structures: `src/renderer/src/lib/rollGroups.ts`

### `RollGroup`

```typescript
type RollGroup = {
  type: 'roll'
  rollNumber: number // sequential 1-based index (chronological by ROLL_FROM fillDate)
  rollChainId: string
  rollType: string // e.g. "Roll Out", "Roll Down & Out"
  rollDetail: string // e.g. "$180 → $175, Apr → May expiration"
  fillDate: string // ROLL_FROM fillDate
  rollFromLeg: LegHistoryEntry
  rollToLeg: LegHistoryEntry
  net: {
    isCredit: boolean
    perContract: number // absolute value per contract
    total: number // absolute value total (perContract * contracts * 100)
  }
}
```

### `NormalLeg`

```typescript
type NormalLeg = {
  type: 'leg'
  leg: LegHistoryEntry
}
```

### `TimelineItem`

```typescript
type TimelineItem = NormalLeg | RollGroup
```

### `CumulativeRollSummary`

```typescript
type CumulativeRollSummary = {
  totalCredits: number // sum of net per contract for credit rolls
  totalDebits: number // sum of net per contract for debit rolls
  net: number // totalCredits - totalDebits
  rollCount: number
}
```

---

## Grouping Logic

`buildRollTimeline(legs: LegHistoryEntry[]): TimelineItem[]`

1. Partition legs into:
   - roll legs: `legRole === 'ROLL_FROM' || legRole === 'ROLL_TO'`
   - normal legs: all others
2. Group roll legs by `rollChainId`. Each group must have exactly one ROLL_FROM and one ROLL_TO.
3. Sort roll groups by ROLL_FROM `fillDate` → assign sequential `rollNumber` starting at 1.
4. Re-merge all items into a single chronological array (sorted by the ROLL_FROM `fillDate` for roll groups, and `fillDate` for normal legs).
5. The cumulative summary is placed immediately after the last roll group in the output (before any normal legs that follow it chronologically).

---

## Roll Type Derivation (from existing `rolls.ts`)

For a roll group, derive type using:

```typescript
getCcRollTypeLabel({
  currentStrike: rollFromLeg.strike,
  newStrike: rollToLeg.strike,
  currentExpiration: rollFromLeg.expiration,
  newExpiration: rollToLeg.expiration
})
```

And detail using `getCcRollTypeDetail` with the same inputs.

---

## Validation Rules from Acceptance Criteria

| Rule                                                                   | Source |
| ---------------------------------------------------------------------- | ------ |
| Net credit displayed in green                                          | AC2    |
| Net debit displayed in amber/yellow                                    | AC3    |
| Roll groups numbered 1, 2, 3... in chronological order                 | AC4    |
| Cumulative summary shows total credits, total debits, and net          | AC4    |
| Roll type label includes strike and expiration change detail           | AC5    |
| Non-roll legs render as normal rows; chronological order maintained    | AC6    |
| ROLL_TO leg shows updated running basis; ROLL_FROM basis cell is empty | AC7    |
