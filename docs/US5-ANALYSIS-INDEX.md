# US-5 CSP Expiration — Analysis Documentation Index

Generated: March 12, 2025  
Scope: Complete codebase analysis for CSP expiration feature implementation

---

## Documents Overview

### 📋 START HERE

**[US5-QUICK-REFERENCE.md](./US5-QUICK-REFERENCE.md)** (5 min read)

- What is US-5? (user story summary)
- High-level architecture diagram
- Implementation checklist
- Data model changes
- Quick file list
- Time estimates
- **Best for**: Understanding what to build and getting started

### 📊 DETAILED ANALYSIS

**[FINAL_SUMMARY.txt](./FINAL_SUMMARY.txt)** (10 min read)

- 7-point detailed analysis of each component
- Current state vs gaps for each area
- Complete implementation checklist with task breakdown
- Full list of all files to modify
- Dependencies and constraints
- Effort estimates

### 🔧 CODE PATTERNS

**[wheelbase-code-patterns.md](./wheelbase-code-patterns.md)** (15 min read)

- Exact code patterns from US-1 to replicate
- Pattern 1: Pure lifecycle engine functions
- Pattern 2: Pure cost basis calculations
- Pattern 3: Service layer composition
- Pattern 4: IPC handler registration
- Pattern 5: Frontend API adapters
- Pattern 6: Testing patterns
- **Best for**: Implementing code with correct patterns

### 📝 GAPS SUMMARY

**[wheelbase-gaps-summary.md](./wheelbase-gaps-summary.md)** (10 min read)

- Status for each of the 7 areas (✅ Complete vs ❌ Missing)
- Specific gaps identified
- "Why" behind each gap
- Actions needed
- Implementation phases
- Key files organized by layer

---

## Quick Navigation by Role

### 🎯 Project Manager / Planning

1. Read: [US5-QUICK-REFERENCE.md](./US5-QUICK-REFERENCE.md) — 5 min
2. Read: [FINAL_SUMMARY.txt](./FINAL_SUMMARY.txt) section "ESTIMATED EFFORT" — 2 min
3. Review: "Implementation Checklist" in FINAL_SUMMARY.txt — 5 min

**Total:** 12 min for planning overview

---

### 💻 Backend Developer

1. Read: [US5-QUICK-REFERENCE.md](./US5-QUICK-REFERENCE.md) — 5 min
2. Read: [wheelbase-code-patterns.md](./wheelbase-code-patterns.md) Patterns 1-4 — 10 min
3. Reference: [wheelbase-gaps-summary.md](./wheelbase-gaps-summary.md) section "3. Lifecycle Engine" — 2 min
4. Reference: [wheelbase-gaps-summary.md](./wheelbase-gaps-summary.md) section "4. Cost Basis Engine" — 2 min

**Implementation order:**

1. Add `expireCSP()` to `src/main/core/lifecycle.ts` (Pattern 1)
2. Add expiration calculation to `src/main/core/costbasis.ts` (Pattern 2)
3. Add `expirePosition()` to `src/main/services/positions.ts` (Pattern 3)
4. Register handler in `src/main/ipc/positions.ts` (Pattern 4)

**Total prep:** 19 min

---

### 🎨 Frontend Developer

1. Read: [US5-QUICK-REFERENCE.md](./US5-QUICK-REFERENCE.md) — 5 min
2. Read: [wheelbase-code-patterns.md](./wheelbase-code-patterns.md) Pattern 5 — 3 min
3. Reference: [wheelbase-gaps-summary.md](./wheelbase-gaps-summary.md) section "6. Frontend Integration" — 2 min

**Implementation order:**

1. Add `expirePosition()` to `src/renderer/src/api/positions.ts` (Pattern 5)
2. Implement `PositionDetailPage` (show position + action button)
3. Add confirm dialog component
4. Wire up success message with "new wheel" link

**Total prep:** 10 min

---

## 7-Part Analysis Structure

### Part 1: Position Models and Types ✅ ~70% Ready

**Status:** Types defined, but `CostBasisSnapshotRecord` missing finalPnl/annualizedReturn  
**Files:** `src/main/core/types.ts`, `src/main/schemas.ts`  
**Gap:** Type mismatch with database schema  
**Details:** See FINAL_SUMMARY.txt section 1

### Part 2: Leg Models and Types ✅ 100% Complete

**Status:** LegRole 'EXPIRE' already defined  
**Files:** `src/main/core/types.ts`  
**Gap:** None  
**Details:** See FINAL_SUMMARY.txt section 2

### Part 3: Lifecycle Engine ❌ 30% Done

**Status:** `openWheel()` exists, `expireCSP()` missing  
**Files:** `src/main/core/lifecycle.ts`  
**Gap:** Need ~20 LOC for expireCSP() function  
**Details:** See wheelbase-gaps-summary.md or FINAL_SUMMARY.txt section 3

### Part 4: Cost Basis Engine ❌ 50% Done

**Status:** Initial basis calculation exists, expiration P&L missing  
**Files:** `src/main/core/costbasis.ts`  
**Gap:** Need ~15 LOC for expiration calculation  
**Details:** See wheelbase-gaps-summary.md or FINAL_SUMMARY.txt section 4

### Part 5: IPC Handlers ❌ 0% Done

**Status:** Handler pattern exists, positions:expire missing  
**Files:** `src/main/ipc/positions.ts`  
**Gap:** Need ~30 LOC for new handler  
**Details:** See FINAL_SUMMARY.txt section 5

### Part 6: Frontend Integration ❌ 50% Done

**Status:** PositionCard ready, PositionDetailPage stub exists  
**Files:** `src/renderer/src/`, PositionDetailPage  
**Gap:** Need detail page implementation + "Mark Expired" flow  
**Details:** See wheelbase-gaps-summary.md or FINAL_SUMMARY.txt section 6

### Part 7: Database Schema ✅ 100% Ready

**Status:** All tables and fields exist  
**Files:** `migrations/001_initial_schema.sql`  
**Gap:** None  
**Details:** See FINAL_SUMMARY.txt section 7

---

## Key Figures at a Glance

| Metric                              | Value                  |
| ----------------------------------- | ---------------------- |
| Backend functions to implement      | 3                      |
| Service methods to implement        | 1                      |
| IPC handlers to register            | 1                      |
| Frontend API functions to implement | 1                      |
| Frontend pages to build             | 1 (PositionDetailPage) |
| Frontend components to build        | 1 (ConfirmDialog)      |
| Database migrations needed          | 0                      |
| Pure functions to test              | 2                      |
| Total files to modify               | 10                     |
| Total new lines of code             | ~375                   |
| Estimated implementation time       | 4-5 hours              |

---

## Architecture Diagram

```
RENDERER (React)
├── PositionDetailPage (implement)
│   ├── Show position summary
│   ├── List all legs
│   └── "Mark Expired" button
├── ConfirmExpireDialog (create)
│   ├── Confirm expiration
│   └── Show success + "New wheel" link
└── api/positions.ts
    └── expirePosition() (add)
           │
        IPC BRIDGE (Electron)
           │
        positions:expire handler (add)
           │
SERVICE LAYER (Node.js)
└── expirePosition()
    ├── Query position & legs
    ├── Call expireCSP() ← engine
    ├── Call calculateCspExpiration() ← engine
    ├── Create EXPIRE leg
    ├── Update position
    └── Transaction commit

PURE ENGINES
├── lifecycle.ts
│   └── expireCSP() (add)
│       ├── Validate phase
│       └── Validate date
├── costbasis.ts
│   └── calculateCspExpiration() (add)
│       └── Calculate finalPnl

DATABASE (SQLite)
├── positions (update)
├── legs (insert)
└── cost_basis_snapshots (insert)
```

---

## Reading Checklist

- [ ] Read US5-QUICK-REFERENCE.md for overview
- [ ] Read FINAL_SUMMARY.txt for complete details
- [ ] Read wheelbase-gaps-summary.md for gap summary
- [ ] Read wheelbase-code-patterns.md for code examples
- [ ] Review the specific analysis section for your component
- [ ] Refer back to code patterns while implementing

---

## Common Questions Answered

**Q: Do I need to create database migrations?**  
A: No. All schema already exists (see Part 7). Just use existing tables.

**Q: What patterns should I follow?**  
A: Replicate US-1 patterns. See wheelbase-code-patterns.md for templates.

**Q: Where do I start?**  
A: Backend developers: Start with `expireCSP()` in lifecycle.ts  
 Frontend developers: Wait for backend, then implement PositionDetailPage

**Q: How much code is this really?**  
A: ~375 LOC total, mostly straightforward. See time estimate in FINAL_SUMMARY.txt

**Q: Can I test locally?**  
A: Yes. Pure engine functions can be tested with Vitest immediately.  
 Service layer needs mocked DB. Frontend needs backend running.

**Q: What if I get stuck?**  
A: Refer to wheelbase-code-patterns.md for exact examples from US-1.  
 Use the issue/error pattern shown in that doc.

---

## Document File Sizes

| File                       | Size  | Read Time |
| -------------------------- | ----- | --------- |
| US5-QUICK-REFERENCE.md     | ~10KB | 5-7 min   |
| FINAL_SUMMARY.txt          | ~11KB | 10-12 min |
| wheelbase-gaps-summary.md  | ~6KB  | 8-10 min  |
| wheelbase-code-patterns.md | ~13KB | 15-20 min |
| wheelbase-analysis.md      | ~13KB | 15-20 min |

---

## Version History

| Date       | Version | Changes                                |
| ---------- | ------- | -------------------------------------- |
| 2025-03-12 | 1.0     | Initial comprehensive analysis created |

---

## How to Use These Documents

1. **For Planning:** Start with US5-QUICK-REFERENCE.md + FINAL_SUMMARY.txt time estimates
2. **For Implementation:** Use wheelbase-code-patterns.md as a code template
3. **For Reference:** Use wheelbase-gaps-summary.md to understand what's missing
4. **For Details:** Use FINAL_SUMMARY.txt or wheelbase-analysis.md for deep dives

Keep these documents open while implementing. Cross-reference as needed.

---

## Next Steps

1. **Planning Phase:** Share FINAL_SUMMARY.txt with team for timeline/estimation
2. **Backend Phase:** Backend dev implements core engines (3-5 days)
3. **Service Phase:** Backend dev implements service + IPC (1-2 days)
4. **Frontend Phase:** Frontend dev implements UI (3-4 days)
5. **Testing Phase:** Full suite of tests (1-2 days)
6. **Integration:** E2E testing + QA (1 day)

---

**Questions?** Refer to the specific document section in this index.  
**Ready to code?** Start with wheelbase-code-patterns.md for templates.  
**Need clarification?** Check FINAL_SUMMARY.txt for detailed explanation of any section.

Good luck! 🚀
