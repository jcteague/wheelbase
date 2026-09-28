---
page: docs/spec/features/us-15-roll-pair-timeline.md
audited_at: 2026-09-28
findings: 3
---

# Audit: docs/spec/features/us-15-roll-pair-timeline.md

## Verified (21)

- ✓ All 17 cited source files exist (`src/main/schemas.ts`, `src/main/services/{get-position,positions,assign-csp-position,close-covered-call-position,close-csp-position,expire-cc-position,expire-csp-position,open-covered-call-position,record-call-away-position,roll-csp-position,roll-cc-position}.ts`, `src/renderer/src/api/positions.ts`, `src/renderer/src/components/LegHistoryTable.tsx`, `src/renderer/src/lib/{rollGroups,rolls,deriveRunningBasis}.ts`)
- ✓ `LegRecord.rollChainId: string | null` — `src/main/schemas.ts:93`
- ✓ `GET_LEGS_QUERY` SELECTs `roll_chain_id` — `src/main/services/get-position.ts:130-133`; `LegRow.roll_chain_id: string | null` — `get-position.ts:170`; `mapLegRow` projects `rollChainId` — `get-position.ts:71`
- ✓ `mapActiveLeg` returns `rollChainId: null` — `get-position.ts:107`
- ✓ Write-path services set `rollChainId: null`: `assign-csp-position.ts:162`, `close-covered-call-position.ts:107`, `close-csp-position.ts:119`, `expire-csp-position.ts:120`, `expire-cc-position.ts:93`, `open-covered-call-position.ts:129`, `record-call-away-position.ts:125`, `positions.ts:157`
- ✓ Roll services generate a shared UUID — `roll-csp-position.ts:61`, `roll-cc-position.ts:68` (`randomUUID()`)
- ✓ `LegDetail.rollChainId: string | null` — `src/renderer/src/api/positions.ts:127`
- ✓ `LegHistoryEntry` exported from `rollGroups.ts:3` with `rollChainId` (`:14`); imported by `LegHistoryTable.tsx:8`
- ✓ `TimelineItem` = `NormalLeg {type:'leg', leg}` | `RollGroup {type:'roll', rollNumber, rollChainId, rollType, rollDetail, fillDate, rollFromLeg, rollToLeg, net:{isCredit, perContract, total}}` | `CumulativeItem {type:'cumulative', summary}` — `rollGroups.ts:18-51`
- ✓ `CumulativeRollSummary {totalCredits, totalDebits, net, rollCount}` — `rollGroups.ts:39-44`
- ✓ `buildRollTimeline` — `rollGroups.ts:107`; `computeCumulativeRollSummary` — `rollGroups.ts:154`
- ✓ Uses `getCcRollTypeLabel` / `getCcRollTypeDetail` / `computeNetCreditDebit` — `rollGroups.ts:1,94-99`; exported at `rolls.ts:82,123,40`; `rollCreditDebitColors` at `rolls.ts:61`; CSP-only `getRollTypeLabel` still at `rolls.ts:25`
- ✓ `LegRow({ leg, isRoll })` with `pl-7` indent — `LegHistoryTable.tsx:89,101`; `RollGroupHeaderRow` — `:135`; `CumulativeSummaryRow` — `:172`
- ✓ Spanning `<td colSpan={8}>` — `LegHistoryTable.tsx:146,180`; `React.Fragment key={item.rollChainId}` — `:231`
- ✓ Module constants `ROLL_CREDIT_BG`, `ROLL_LEG_BG`, `CUMULATIVE_BG` — `LegHistoryTable.tsx:19-21`
- ✓ Final P&L stays in `<tfoot>` — `LegHistoryTable.tsx:242-254`
- ✓ `roll_chain_id TEXT` exists in migration 001 — `migrations/001*.sql:33`
- ✓ `src/renderer/src/lib/deriveRunningBasis.test.ts` exists (regression coverage claim)
- ✓ Open item still accurate: no `e2e/us15-roll-pair-timeline.spec.ts`, and no e2e file references US-15
- ✓ Linked spec pages exist: `contracts/ipc-handlers.md`, `domain/cost-basis.md`, `schema/tables.md`, `us-11-leg-history.md`, `us-12-roll-csp.md`, `us-13-roll-down-and-out.md`
- ✓ `positions:get` handler unchanged in channel set (no new IPC channel)

## Drift (0)

None.

## Unverifiable (3)

- ? AC rendering copy ("Roll Down & Out: $180 → $175, Apr 18 → May 16", "+$1.60/contract", green vs amber) — visual/format claims; not mechanically re-verified.
- ? "Inline `style` is reserved for runtime-derived colours" — `LegHistoryTable.tsx:99,178,182` also apply the static constants and a static border via inline `style`. Borderline vs the CLAUDE.md Tailwind rule; flag for human review.
- ? Open item cites `plans/us-15/tasks.md`; `plans/us-15/` no longer exists (plan dirs deleted by design). Historical reference, not a link.

## Missing files (0)

None.
