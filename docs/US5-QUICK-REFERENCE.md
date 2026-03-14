# US-5: CSP Expiration — Quick Reference Guide

## What is US-5?
Mark a CSP (Covered Secured Put) as expired worthless when the option expires with no value. The wheel is complete, trader keeps 100% premium, position marked closed.

## User Story
**As a** wheel trader whose CSP has expired out of the money,  
**I want to** record the expiration so the wheel is marked complete with 100% premium captured,  
**So that** I can see the final P&L and free up my attention for active positions.

---

## Acceptance Criteria (Summary)

```
Phase Transition:  CSP_OPEN → WHEEL_COMPLETE
Status Transition: ACTIVE → CLOSED
Final P&L:         100% of total premium collected
New Leg:           EXPIRE leg with no fill price
Validation:        Position phase must be CSP_OPEN
                   Current date must be >= expiration date
```

## Example
```
Input:   Position AAPL CSP_OPEN, strike $180, expiration 2026-04-17
         Today: 2026-04-17 or later
Result:  Position updated to WHEEL_COMPLETE, CLOSED
         EXPIRE leg created with premium=$250 (collected at open)
         Post-action: "Open new wheel on AAPL" button shown
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                       FRONTEND (React)                       │
│  ┌──────────────────────┐      ┌───────────────────────┐   │
│  │ PositionDetailPage   │      │ ConfirmExpireDialog   │   │
│  │ - Show position      │──→   │ - Confirm action      │   │
│  │ - "Mark Expired"btn  │      │ - "Open new wheel"    │   │
│  └──────┬───────────────┘      └───────────┬───────────┘   │
│         │                                   │                │
│         └───────────────────────┬───────────┘                │
│                                 │                            │
│                    expirePosition(positionId)                │
│                                 │                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │
┌─────────────────────────────────┼────────────────────────────┐
│                     IPC LAYER (Electron)                     │
│                 positions:expire handler                      │
│                                 │                            │
└─────────────────────────────────┼────────────────────────────┘
                                  │
┌─────────────────────────────────┼────────────────────────────┐
│                  SERVICE LAYER (Node.js)                     │
│              expirePosition(db, positionId)                  │
│  ┌─────────────────────────────────────────────────┐        │
│  │ 1. Query position and latest leg/snapshot       │        │
│  │ 2. Call lifecycle engine (validation)           │        │
│  │ 3. Call cost basis engine (P&L calculation)     │        │
│  │ 4. Create EXPIRE leg                            │        │
│  │ 5. Update position phase & status in transaction│        │
│  │ 6. Return updated data                          │        │
│  └─────────────────────────────────────────────────┘        │
│         │              │              │                      │
└─────────┼──────────────┼──────────────┼──────────────────────┘
          │              │              │
┌─────────▼──┐    ┌──────▼────────┐   │
│  Lifecycle │    │  Cost Basis   │   │
│  Engine    │    │  Engine       │   │
│ ─────────  │    │ ────────────  │   │
│ expireCSP()│    │ calculateCSP │   │
│            │    │ Expiration() │   │
│ • Validate │    │              │   │
│   phase    │    │ • finalPnl=  │   │
│ • Validate │    │   premium    │   │
│   date     │    │              │   │
│ • Return   │    └──────────────┘   │
│   COMPLETE │                        │
└────────────┘                        │
                          ┌───────────▼─────────┐
                          │   DATABASE          │
                          │ ──────────────────  │
                          │ Update position     │
                          │ Create leg          │
                          │ Create snapshot     │
                          │ (transaction)       │
                          └─────────────────────┘
```

---

## Implementation Checklist

### ✅ Already Done (US-1 Foundation)
- [x] Database schema (all tables and fields exist)
- [x] Basic types and enums
- [x] IPC handler registration pattern
- [x] Service layer composition pattern
- [x] Frontend API adapter pattern
- [x] PositionCard component with phase rendering

### 🔨 Must Implement for US-5
- [ ] **Backend Core (Pure Functions)**
  - [ ] `expireCSP(position, currentDate)` in `lifecycle.ts`
  - [ ] Expiration P&L calc in `costbasis.ts`
  - [ ] Tests for both

- [ ] **Backend Service & IPC**
  - [ ] `expirePosition()` service in `services/positions.ts`
  - [ ] `positions:expire` handler in `ipc/positions.ts`

- [ ] **Frontend**
  - [ ] `expirePosition()` in `api/positions.ts`
  - [ ] Implement `PositionDetailPage` (currently stub)
  - [ ] "Mark Expired" button
  - [ ] Confirm dialog
  - [ ] Success message

---

## Data Model

### Position Fields Changed
```typescript
phase:      CSP_OPEN → WHEEL_COMPLETE
status:     ACTIVE → CLOSED
closed_date: null → NOW
updated_at:  NOW
```

### New Leg Created
```typescript
legRole:              'EXPIRE'
action:               'EXPIRE'
optionType:           'PUT'
strike:               (from original CSP)
expiration:           (from original CSP)
contracts:            (from original CSP)
premiumPerContract:   '0'
fill_price:           null
fill_date:            (expiration date)
```

### New Cost Basis Snapshot
```typescript
basisPerShare:         (unchanged from last snapshot)
totalPremiumCollected: (unchanged)
finalPnl:              totalPremiumCollected (100% profit)
annualizedReturn:      (calculated at wheel completion)
snapshotAt:            NOW
```

---

## Testing Strategy

### Unit Tests (Pure Functions)
```
expireCSP():
  ✓ Happy path: CSP_OPEN + valid date → WHEEL_COMPLETE
  ✓ Reject: wrong phase
  ✓ Reject: date before expiration
  ✓ Allow: date on expiration day
  ✓ Allow: date after expiration day

calculateCspExpiration():
  ✓ Happy path: premium collected → finalPnl (100%)
  ✓ Decimal precision
  ✓ Rounding HALF_UP to 4 places
```

### Service Tests
```
expirePosition():
  ✓ Happy path: valid position expires successfully
  ✓ Position and leg queried correctly
  ✓ Transaction commits atomically
  ✓ Returns complete result object
  ✓ Lifecycle engine validation errors propagate
  ✗ (Mocked DB for unit tests)
```

### Frontend Tests
```
PositionDetailPage:
  ✓ Renders position summary
  ✓ Shows leg history
  ✓ "Mark Expired" button visible when phase=CSP_OPEN
  ✓ Opens confirm dialog on click

ConfirmExpireDialog:
  ✓ Shows position details
  ✓ "Confirm" calls expirePosition
  ✓ Shows success message
  ✓ "Open new wheel" link navigates correctly
```

---

## Validation Rules

```
✓ Position phase must be CSP_OPEN
✓ Current date must be >= expiration date
✓ Position must exist in database
✓ Cannot expire already-closed positions
✓ Cannot expire future-dated positions
```

## Error Handling

```
400 Bad Request:
  - Position not in CSP_OPEN phase
  - Current date before expiration date
  - Position not found

500 Internal Server Error:
  - Database connection fails
  - Transaction fails
  - Unexpected error
```

---

## API Endpoint

### Request
```
PATCH /api/positions/:positionId/expire
Content-Type: application/json

Body (optional):
{
  "expiration_date_override": "2026-04-20"  // Override actual expiration
}
```

### Success Response (200)
```json
{
  "ok": true,
  "position": {
    "id": "uuid",
    "ticker": "AAPL",
    "phase": "WHEEL_COMPLETE",
    "status": "CLOSED",
    ...
  },
  "leg": {
    "id": "uuid",
    "position_id": "uuid",
    "leg_role": "EXPIRE",
    "action": "EXPIRE",
    ...
  },
  "costBasisSnapshot": {
    "id": "uuid",
    "position_id": "uuid",
    "basis_per_share": "146.50",
    "total_premium_collected": "250.00",
    "final_pnl": "250.00",
    ...
  }
}
```

### Error Response (400)
```json
{
  "ok": false,
  "errors": [
    {
      "field": "phase",
      "code": "invalid_phase",
      "message": "Position is not in CSP_OPEN phase"
    }
  ]
}
```

---

## Files to Modify

### Backend (7 files)
1. `src/main/core/lifecycle.ts` — Add `expireCSP()`
2. `src/main/core/lifecycle.test.ts` — Add tests
3. `src/main/core/costbasis.ts` — Add expiration calculation
4. `src/main/core/costbasis.test.ts` — Add tests
5. `src/main/schemas.ts` — Update CostBasisSnapshotRecord
6. `src/main/services/positions.ts` — Add `expirePosition()`
7. `src/main/ipc/positions.ts` — Register handler

### Frontend (3+ files)
1. `src/renderer/src/api/positions.ts` — Add `expirePosition()`
2. `src/renderer/src/pages/PositionDetailPage.tsx` — Implement page
3. `src/renderer/src/components/ConfirmExpireDialog.tsx` — New dialog (optional)

---

## Related Stories

- **US-1**: Open a new wheel (creates CSP_OPEN position to expire)
- **US-3**: Position detail page (provides UI context for expire action)
- **US-4+**: Assignment, CC, rolls (other phase transitions)

---

## Dependency Graph

```
PositionDetailPage
  ↓
expirePosition(api)
  ↓
window.api.expirePosition
  ↓
positions:expire (IPC handler)
  ↓
expirePosition(service)
  ├─ expireCSP(lifecycle) ← pure function
  ├─ calculateCspExpiration(costbasis) ← pure function
  └─ Database transactions
```

---

## Time Estimate

| Component | LOC | Time |
|-----------|-----|------|
| Lifecycle engine | 20 | 30 min |
| Cost basis calculation | 15 | 20 min |
| Service function | 40 | 30 min |
| IPC handler | 30 | 20 min |
| Frontend API | 20 | 20 min |
| PositionDetailPage | 150 | 90 min |
| Tests | 100 | 60 min |
| **Total** | **375** | **4.5 hours** |

---

## Progress Tracking

Use these identifiers when asking for help:
- `T-LC`: Lifecycle engine work
- `T-CB`: Cost basis work
- `T-SVC`: Service layer work
- `T-IPC`: IPC handler work
- `T-FE`: Frontend work
- `T-TEST`: Testing work

Example: "Stuck on T-LC, expireCSP validation" or "Implement T-SVC service function"

---

## Key Success Criteria

✅ Position phase changes from CSP_OPEN to WHEEL_COMPLETE  
✅ Position status changes from ACTIVE to CLOSED  
✅ EXPIRE leg is recorded  
✅ Cost basis snapshot shows final_pnl = 100% of collected premium  
✅ Date validation: allow on or after expiration date  
✅ "Open new wheel on TICKER" shortcut shown after success  
✅ No database migrations needed  
✅ All tests pass  
✅ Pure functions have no side effects  

---

Generated: $(date)
