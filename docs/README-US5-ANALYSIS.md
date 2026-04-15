# US-5 Analysis Documentation — README

## Overview

This directory contains a complete codebase analysis for US-5 (CSP Expiration feature) for the Wheelbase application.

**Status:** ✅ Analysis Complete — Ready for Implementation  
**Generated:** March 12, 2025  
**Total LOC to write:** ~375  
**Estimated time:** 4-5 hours

---

## Document Guide

### Quick Start (First Time)

**Start here:** [`US5-ANALYSIS-INDEX.md`](./US5-ANALYSIS-INDEX.md)

- Navigation guide to all documents
- Role-based reading paths (manager, backend dev, frontend dev)
- Quick reference for all 7 analysis areas
- Time estimate: 5 minutes

### For Planning & Decision Making

**Read:** [`US5-QUICK-REFERENCE.md`](./US5-QUICK-REFERENCE.md)

- User story summary
- Acceptance criteria
- Architecture overview diagram
- Implementation checklist
- Data model changes
- API endpoint specifications
- Effort estimates
- Time estimate: 5-7 minutes

### For Complete Detailed Analysis

**Read:** [`FINAL_SUMMARY.txt`](./FINAL_SUMMARY.txt)

- 7-point detailed analysis of each component
- Current state vs gaps for each area
- Complete implementation checklist with 5 phases
- Full list of files to modify
- Dependencies and constraints
- Risk assessment
- Effort breakdown
- Time estimate: 10-12 minutes

### For Implementation (Code Patterns)

**Reference:** [`wheelbase-code-patterns.md`](./wheelbase-code-patterns.md)

- 6 exact code patterns extracted from US-1
- Pattern 1: Pure lifecycle engine functions
- Pattern 2: Pure cost basis calculations
- Pattern 3: Service layer composition
- Pattern 4: IPC handler registration
- Pattern 5: Frontend API adapters
- Pattern 6: Testing patterns
- Template code ready to adapt
- Time estimate: 15-20 minutes

### For Component Status Reference

**Reference:** [`wheelbase-gaps-summary.md`](./wheelbase-gaps-summary.md)

- Status for each of 7 areas (✅ complete vs ❌ missing)
- Specific gaps identified with line counts
- Actions needed per component
- Implementation phases
- File modification list
- Dependencies & notes
- Time estimate: 8-10 minutes

---

## 7-Part Analysis Summary

### 1. Position Models & Types

**Status:** ✅ 70% Ready  
**Files:** `src/main/core/types.ts`, `src/main/schemas.ts`  
**Gap:** CostBasisSnapshotRecord missing `finalPnl` and `annualizedReturn` fields  
**Action:** Add ~5 LOC to update TypeScript schema (fields exist in DB)

### 2. Leg Models & Types

**Status:** ✅ 100% Complete  
**Files:** `src/main/core/types.ts`  
**Gap:** None — `LegRole 'EXPIRE'` already defined  
**Action:** No changes needed

### 3. Lifecycle Engine

**Status:** ❌ 30% Done  
**Files:** `src/main/core/lifecycle.ts`  
**Gap:** Need `expireCSP()` function (~20 LOC)  
**Action:** Replicate `openWheel()` pattern for expiration validation

### 4. Cost Basis Engine

**Status:** ❌ 50% Done  
**Files:** `src/main/core/costbasis.ts`  
**Gap:** Need expiration P&L calculation (~15 LOC)  
**Action:** Add function that returns `finalPnl = totalPremiumCollected`

### 5. IPC Handlers

**Status:** ❌ 0% Done  
**Files:** `src/main/ipc/positions.ts`  
**Gap:** Need `positions:expire` handler (~30 LOC)  
**Action:** Replicate `positions:create` handler pattern

### 6. Frontend Integration

**Status:** ❌ 50% Done  
**Files:** `src/renderer/src/`, PositionDetailPage  
**Gap:** Need PositionDetailPage (~150 LOC) + ConfirmDialog (~50 LOC)  
**Action:** Implement detail page with "Mark Expired" action and confirm dialog

### 7. Database Schema

**Status:** ✅ 100% Ready  
**Files:** `migrations/001_initial_schema.sql`  
**Gap:** None  
**Action:** No migrations needed — all fields exist

---

## Implementation Roadmap

### Phase 1: Backend Core (Pure Functions) — 1-2 hours

- Add `expireCSP()` to lifecycle.ts
- Add expiration P&L to costbasis.ts
- Update types in schemas.ts
- Write tests

### Phase 2: Backend Service & IPC — 1-2 hours

- Add `expirePosition()` service
- Register `positions:expire` handler
- Implement error handling

### Phase 3: Frontend API — 30 minutes

- Add `expirePosition()` function
- Handle response transformation

### Phase 4: Frontend UI — 2-3 hours

- Implement PositionDetailPage
- Add "Mark Expired" button
- Create ConfirmExpireDialog
- Add post-action navigation

### Phase 5: Testing — 1-2 hours

- Unit tests for engines
- Service tests
- Component tests

---

## Files to Modify

### Backend (7 files)

1. `src/main/core/lifecycle.ts` — Add `expireCSP()`
2. `src/main/core/lifecycle.test.ts` — Add tests
3. `src/main/core/costbasis.ts` — Add calculation
4. `src/main/core/costbasis.test.ts` — Add tests
5. `src/main/schemas.ts` — Update CostBasisSnapshotRecord
6. `src/main/services/positions.ts` — Add `expirePosition()` service
7. `src/main/ipc/positions.ts` — Register `positions:expire` handler

### Frontend (3+ files)

8. `src/renderer/src/api/positions.ts` — Add `expirePosition()` API call
9. `src/renderer/src/pages/PositionDetailPage.tsx` — Implement detail view
10. `src/renderer/src/components/ConfirmExpireDialog.tsx` — New component (optional)

### No Changes Needed

- Database schema
- Leg types
- Pattern infrastructure

---

## Key Metrics

| Metric                         | Value      |
| ------------------------------ | ---------- |
| Backend functions to implement | 3          |
| Service methods to implement   | 1          |
| IPC handlers to register       | 1          |
| Frontend API functions         | 1          |
| Frontend pages to build        | 1          |
| Frontend components to build   | 1          |
| Database migrations            | 0          |
| Total files to modify          | 10         |
| Total new lines of code        | ~375       |
| Estimated implementation time  | 4-5 hours  |
| Complexity level               | Low-Medium |
| Risk level                     | Low        |

---

## How to Use These Documents

### For Project Managers

1. Read: US5-QUICK-REFERENCE.md (5 min)
2. Review: FINAL_SUMMARY.txt "ESTIMATED EFFORT" section (2 min)
3. Share: FINAL_SUMMARY.txt with team for estimates

### For Backend Developers

1. Read: US5-QUICK-REFERENCE.md (5 min)
2. Study: wheelbase-code-patterns.md Patterns 1-4 (10 min)
3. Reference: wheelbase-gaps-summary.md section 3-5 while coding
4. Implement: Phase 1, Phase 2 (using code patterns as templates)

### For Frontend Developers

1. Read: US5-QUICK-REFERENCE.md (5 min)
2. Study: wheelbase-code-patterns.md Pattern 5 (3 min)
3. Reference: wheelbase-gaps-summary.md section 6 while coding
4. Implement: Phase 3, Phase 4 (after backend is complete)

---

## Success Criteria

- ✅ Position phase changes from CSP_OPEN to WHEEL_COMPLETE
- ✅ Position status changes from ACTIVE to CLOSED
- ✅ EXPIRE leg is recorded with no fill price
- ✅ Cost basis snapshot shows final_pnl = 100% of premium
- ✅ Date validation: allow on or after expiration date
- ✅ "Open new wheel on TICKER" shortcut shown post-expiration
- ✅ No database migrations needed
- ✅ All tests passing
- ✅ Pure functions remain pure (no side effects)
- ✅ Transaction atomicity maintained

---

## Dependencies

**Within Project:**

- US-1 (Open wheel) — creates positions to expire
- US-3 (Position detail page) — provides UI context

**External Libraries (already in use):**

- better-sqlite3 — database access
- Zod — schema validation
- Decimal.js — precision math
- React — frontend
- Vitest — testing

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│      RENDERER (React)               │
│  ┌─────────────────────────────────┐│
│  │ PositionDetailPage              ││
│  │ - Show position + legs          ││
│  │ - "Mark Expired" button         ││
│  └────────────────┬────────────────┘│
│                   │                  │
│  ┌────────────────▼────────────────┐│
│  │ ConfirmExpireDialog             ││
│  │ - Confirm action                ││
│  │ - Show "New wheel on TICKER"    ││
│  └────────────────┬────────────────┘│
│                   │                  │
│  ┌────────────────▼────────────────┐│
│  │ expirePosition(api)             ││
│  └────────────────┬────────────────┘│
└────────────────────┼──────────────────┘
                     │ IPC Bridge
                     │
┌────────────────────▼──────────────────┐
│    positions:expire IPC Handler       │
│    - Validate & call service          │
└────────────────────┬──────────────────┘
                     │
┌────────────────────▼──────────────────┐
│    expirePosition(service)            │
│    - Query position & legs            │
│    - Call engines (validation, P&L)   │
│    - Create EXPIRE leg                │
│    - Update position & snapshot       │
└────────────────────┬──────────────────┘
        │            │            │
    ┌───▼─┐  ┌──────▼────┐  ┌────▼──────┐
    │ LC  │  │   Cost    │  │ Database  │
    │ Eng │  │  Basis    │  │ Trans.    │
    └─────┘  │   Engine  │  └───────────┘
             └───────────┘
```

---

## Document Size & Read Time

| Document                   | Size | Read Time | Purpose        |
| -------------------------- | ---- | --------- | -------------- |
| US5-ANALYSIS-INDEX.md      | 9.2K | 5 min     | Navigation     |
| US5-QUICK-REFERENCE.md     | 12K  | 5-7 min   | Planning       |
| FINAL_SUMMARY.txt          | 11K  | 10-12 min | Details        |
| wheelbase-code-patterns.md | 15K  | 15-20 min | Implementation |
| wheelbase-gaps-summary.md  | 5.9K | 8-10 min  | Gaps           |

**Total:** 53K of documentation  
**Total read time:** 43-54 minutes for complete understanding

---

## Questions & Answers

**Q: Do I need to create database migrations?**  
A: No. All schema already exists. Just implement the code logic.

**Q: What patterns should I follow?**  
A: Replicate US-1 patterns. See wheelbase-code-patterns.md for templates.

**Q: Where do I start?**  
A: Backend: Start with `expireCSP()` in lifecycle.ts  
 Frontend: Wait for backend, then implement PositionDetailPage

**Q: How much is this really?**  
A: ~375 LOC total, 4-5 hours. Most is adaptation of existing patterns.

**Q: Can I test locally?**  
A: Yes. Pure functions can be tested immediately with Vitest.

---

## Contact & Support

If you have questions:

1. Check the relevant document section
2. Review wheelbase-code-patterns.md for examples
3. Refer to wheelbase-gaps-summary.md for component status
4. Check FINAL_SUMMARY.txt for detailed explanations

---

## Version Information

**Analysis Version:** 1.0  
**Generated:** March 12, 2025  
**Wheelbase Branch:** usp-5  
**Feature:** US-5 CSP Expiration

---

**Status: ✅ READY TO BUILD**  
All analysis complete. Patterns identified. Gaps quantified. Go forth and implement! 🚀
