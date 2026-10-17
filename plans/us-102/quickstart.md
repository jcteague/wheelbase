# US-102 — Verification guide

Planning artifacts only. These commands apply during implementation.
No migration, broker credentials or new dependencies are needed.

## Unit and integration

```bash
pnpm rebuild:node
pnpm test src/main/core/pmcc-rules.test.ts src/main/core/pmcc-rules.property.test.ts src/main/core/lifecycle.test.ts src/main/core/lifecycle.property.test.ts
pnpm test src/main/services/roll-pmcc-short-call-position.test.ts src/main/services/roll-pmcc-leaps-position.test.ts src/main/ipc/positions.test.ts
pnpm test src/renderer/src/lib/dates.test.ts src/renderer/src/components/RollPmccShortCallSheet.test.tsx src/renderer/src/components/RollPmccLeapsSheet.test.tsx
```

`dates.test.ts` may be added if absent. Run existing entry schemas/forms and both
roll schemas/forms as regressions through the full suite. Most coverage behavior
is already implemented: document already-green cases rather than manufacturing
failures. New tests should expose the remaining calendar/timezone gaps first.

Use generated valid dates and an independent chronological oracle for comparator
properties. Include equality, one-day boundaries, year changes and leap days.
Stress new properties with 500 runs across several fixed seeds in temporary setup,
then remove overrides. Use injected `today='2026-09-14'` for exact DTE review tests.
Test New York day selection at midnight boundaries and across DST with fixed
instants while the process runs in a different timezone.

## Required code-change checks

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm format
```

Keep pure core free of logging; retain existing INFO roll rejection and DEBUG
comparator inputs and transaction checkpoints. Preserve unmodified user work.

## Electron acceptance verification

```bash
pnpm rebuild:electron
TZ=America/New_York pnpm test:e2e e2e/pmcc-expiration-safety.spec.ts e2e/pmcc-short-call-roll.spec.ts e2e/pmcc-leaps-roll.spec.ts e2e/open-pmcc-position.spec.ts
```

The new safety spec covers seven currently executable scenario families, nine
cases after outline expansion. Reuse existing PMCC creation, short-roll and
LEAPS-roll helpers and temporary SQLite fixtures. Use dates relative to the test
day preserving the story's offsets; exact fixed-date DTE values are covered by
component tests. Avoid a new production clock API and expired fixed fixtures.
Use real roll forms and IPC; inspect all legs, snapshots and original open-pair
values after rejection, not merely error text. No-short setup may use the existing
test PMCC event seam; it must not substitute for US-115's future record workflow.

The remaining two scenario families (three cases) run through the real US-115
workflow once it lands. Track them as acceptance handoff, not skipped tests or
passing US-102 workflow coverage. US-102 does not wait on US-115 to deliver its
shared prerequisite. Do not mark the entire cross-story acceptance set verified
until those cases have run.

```bash
pnpm rebuild:node
```

After implemented work passes, run `/update-spec us-102` with the actual scope:
shared invariant plus existing paths; clearly identify US-115's future consumer.
