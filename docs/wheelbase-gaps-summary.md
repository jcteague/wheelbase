# US-5 Implementation Gaps — Quick Reference

## 1. Position Models and Types ✅ ~70% Ready

**Current State:**
- Types defined: `WheelPhase`, `WheelStatus`, `LegRole`, `LegAction`, `OptionType`
- Schemas: PositionRecord, LegRecord, CostBasisSnapshotRecord

**Gaps:**
- ❌ Backend `WheelPhase` enum missing intermediate phases (`CSP_EXPIRED`, `CSP_CLOSED_PROFIT`, etc.)
  - ℹ️ Renderer has them; backend only has: CSP_OPEN, HOLDING_SHARES, CC_OPEN, WHEEL_COMPLETE
  - US-5 spec says skip CSP_EXPIRED intermediate, go straight CSP_OPEN → WHEEL_COMPLETE
- ❌ `CostBasisSnapshotRecord` missing `finalPnl` and `annualizedReturn` fields
  - ✅ Fields exist in database schema, just not in TS types
  
**Action:** Update `core/types.ts` and `schemas.ts` to add missing fields to CostBasisSnapshotRecord

---

## 2. Leg Models and Types ✅ Complete

**Current State:**
- `LegRole` includes 'EXPIRE'
- `LegAction` has 'SELL', 'BUY'
- `OptionType` has 'PUT', 'CALL'
- Database legs table supports all needed fields

**Note:** EXPIRE legs will be special — they won't be SELL/BUY, just EXPIRE action

**Action:** No changes needed; existing types support expiration legs

---

## 3. Lifecycle Engine ❌ 30% Done

**Current State:**
- ✅ `openWheel()` function validates CSP opening
- ✅ Pure function pattern established
- ✅ Comprehensive tests

**Missing:**
- ❌ `expireCSP(position)` function
  - Validate phase = CSP_OPEN
  - Validate currentDate >= expirationDate
  - Return { phase: 'WHEEL_COMPLETE' }
  - ~20 lines of code + tests

**Action:** Implement `expireCSP()` in `src/main/core/lifecycle.ts`

---

## 4. Cost Basis Engine ❌ 50% Done

**Current State:**
- ✅ `calculateInitialCspBasis()` for opening positions
- ✅ Pure function with Decimal.js precision
- ✅ Comprehensive tests

**Missing:**
- ❌ Expiration P&L calculation
  - finalPnl = totalPremiumCollected (100% profit)
  - Could be new function or extend existing
  - ~10 lines of code

**Action:** Add expiration calculation to `src/main/core/costbasis.ts`
- Option A: `calculateCspExpiration(totalPremiumCollected)` new function
- Option B: Extend `CostBasisResult` to include optional `finalPnl`

---

## 5. IPC Handlers ❌ Not Started

**Current State:**
- ✅ Handler registration pattern established
- ✅ Two handlers exist: `positions:list`, `positions:create`

**Missing:**
- ❌ `positions:expire` handler not registered
  - Accept: { positionId: string, expirationDateOverride?: string }
  - Return: { ok: true, position, leg, costBasisSnapshot } or { ok: false, errors }
  - ~30 lines

**Action:** Add handler to `src/main/ipc/positions.ts`

---

## 6. Frontend Integration ❌ 50% Done

**Current State:**
- ✅ PositionCard renders all phases including WHEEL_COMPLETE
- ✅ PositionsList displays positions
- ✅ API adapter layer exists
- ✅ Phase colors and labels for completion defined
- ✅ Frontend types include CSP_EXPIRED, WHEEL_COMPLETE phases

**Missing:**
- ❌ `expirePosition(id)` API function in `src/renderer/src/api/positions.ts`
- ❌ "Mark Expired" action button (no PositionDetailPage yet)
- ❌ Confirmation dialog for expiration
- ❌ Success message with "Open new wheel on TICKER" shortcut
- ❌ PositionDetailPage (stub exists, needs implementation)

**Action:** 
1. Add `expirePosition()` to API layer
2. Add "Mark Expired" button (depends on PositionDetailPage implementation)
3. Add confirmation dialog
4. Add post-action navigation

---

## 7. Database Schema ✅ 100% Ready

**Current State:**
- ✅ All tables exist with proper fields
- ✅ Foreign keys defined
- ✅ Indexes for common queries
- ✅ Null fields for optional values (fill_price, final_pnl)
- ✅ Position.closed_date for tracking closure
- ✅ Transaction support

**Gap:** None — schema is complete

---

## Implementation Checklist

### Phase 1: Backend Core (Pure functions)
- [ ] Add `expireCSP()` to `src/main/core/lifecycle.ts` (~20 LOC + 10 tests)
- [ ] Add expiration P&L to `src/main/core/costbasis.ts` (~15 LOC + 5 tests)
- [ ] Update types in `src/main/core/types.ts` and `src/main/schemas.ts` (~5 LOC)

### Phase 2: Backend Service & IPC
- [ ] Add `expirePosition()` service in `src/main/services/positions.ts` (~40 LOC)
- [ ] Add `positions:expire` handler in `src/main/ipc/positions.ts` (~30 LOC)

### Phase 3: Frontend
- [ ] Add `expirePosition()` function to `src/renderer/src/api/positions.ts` (~20 LOC)
- [ ] Implement PositionDetailPage (`src/renderer/src/pages/PositionDetailPage.tsx`)
  - Show position details
  - List legs
  - Add "Mark Expired" action button
  - Add confirmation dialog
  - Show success with "New wheel" shortcut

### Testing
- [ ] Unit tests for lifecycle engine
- [ ] Unit tests for cost basis
- [ ] Service layer tests (mocked DB)
- [ ] Frontend API tests
- [ ] Component tests for PositionDetailPage

---

## Key Files to Modify

### Backend
1. `src/main/core/lifecycle.ts` — Add expireCSP()
2. `src/main/core/lifecycle.test.ts` — Add tests
3. `src/main/core/costbasis.ts` — Add expiration calculation
4. `src/main/core/costbasis.test.ts` — Add tests
5. `src/main/core/types.ts` — Update if needed
6. `src/main/schemas.ts` — Update CostBasisSnapshotRecord
7. `src/main/services/positions.ts` — Add expirePosition()
8. `src/main/services/positions.test.ts` — Add tests (if exists)
9. `src/main/ipc/positions.ts` — Add handler

### Frontend
1. `src/renderer/src/api/positions.ts` — Add expirePosition()
2. `src/renderer/src/pages/PositionDetailPage.tsx` — Implement detail view
3. (Optional) New component: `ConfirmExpireDialog.tsx`

---

## Dependencies & Notes

- **No schema migrations needed** — all fields already exist
- **Pure functions established** — follow openWheel() pattern
- **Transaction pattern established** — follow createPosition() pattern
- **Frontend types ahead of backend** — types already include phases backend doesn't use yet
- **PositionDetailPage required** for expiration UI — currently stub
- **Expiration date validation** — allow on or after expiration date (Friday close)

