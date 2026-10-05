# Green Phase Results: US-103 Area 10 — PMCC list row shows the running cost basis

## Change

`src/renderer/src/components/PmccPositionRow.tsx`: destructures `basisTotal` (not `initialNetDebit`) from `item.pmcc`; the last cell renders `fmtMoneyGrouped(basisTotal)` with no ` net debit` suffix. Same `VALUE_CLASS text-wb-text-primary` classes. No other file touched.

## Results

- `PmccPositionRow.test.tsx` + `PositionCard.test.tsx`: 41/41 pass.
- `pnpm test`: only the expected Area 9 failures (`PmccCostBasis.spec.tsx`, `PositionCockpit.spec.tsx` PMCC drawer, `lib/format.test.ts` `fmtPct1`). `index.test.ts`, `ipc/ivr|market-data|positions.test.ts` timed out under load and pass when rerun alone.
- `pnpm lint`: 0 errors (1 prettier warning in Area 9's `PmccCostBasis.spec.tsx`).
- `pnpm typecheck`: errors only in Area 9 files; none for `PmccPositionRow` / `PositionCard` / `initialNetDebit`.
- Mockup: not re-read; the change follows the plan § 10 / red handoff exactly.
