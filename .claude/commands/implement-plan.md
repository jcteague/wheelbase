---
description: Implements tasks from a plan file in TDD order, then loops on verification gates (AC coverage, e2e, 95% code coverage, mutation) and a fresh-context code review until all gates pass. Finishes by updating documentation and the spec wiki.
argument-hint: <us-id|plan-file-path> [all|red|green|refactor|layer-N]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Skill
  - Agent
---

# implement-plan command

The user has invoked `/implement-plan` with arguments: `$ARGUMENTS`

This command does **not** stop when the tasks are checked off. It runs a verification
loop until every gate passes, then a code-review loop, then updates documentation.

```
Step 3  Execute tasks (TDD)
   ↓
Step 4  VERIFICATION LOOP ──── gate fails ──→ remediate (Red → Green) ──┐
   ↓ all gates pass                                                     │
Step 5  CODE REVIEW LOOP ───── blocking findings ──→ fix ───────────────┘
   ↓ clean review
Step 6  Documentation + spec wiki
   ↓
Step 7  Final report
```

---

## Step 0 — Parse Arguments

Split `$ARGUMENTS` on the first space:

- **First token** = story ID or plan file path (required)
- **Filter** = the second token (optional, default: `all`)

**Resolve the plan file path:**

- If the first token looks like a story ID (e.g. `us-4`, `us-12`) → derive the path as `plans/<id>/plan.md`
- Otherwise treat it as a literal file path

**Derive tasks file path:** same directory as the plan, named `tasks.md` (e.g. `plans/us-4/tasks.md`)

Valid filter values:

- `all` — every open task
- `red` — only `[Red]` tasks
- `green` — only `[Green]` tasks
- `refactor` — only `[Refactor]` tasks
- `layer-N` — only tasks in Layer N (e.g. `layer-1`, `layer-2`)

**Partial runs skip the loop.** Steps 4–6 run only when the filter is `all` and the
plan has zero open tasks left afterwards. For `red`, `green`, `refactor`, or
`layer-N` filters, stop after Step 3 and print the continue hint — a slice of a plan
cannot satisfy the AC or coverage gates.

---

## Step 1 — Load the Plan, Tasks, and Acceptance Criteria

1. Read the plan file. If it does not exist, stop: "File not found: `<path>`"
2. Read `tasks.md`. If it does not exist, stop:
   > "No tasks file found. Run `/plan-tasks <plan-file>` first to generate it."
3. Locate the user story the plan implements (the plan header links it; otherwise
   search `docs/epics/*/`). Read it and extract the full AC list **now** — the
   verification loop needs it, and finding it late is the usual cause of a missed gate.
   If no story file can be found, stop and ask the user for its path.

Parse the tasks file to build the execution list:

- Each unchecked `- [ ]` line with `[Red]`, `[Green]`, or `[Refactor]` is an open task
- Each checked `- [x]` line is already complete — skip it
- Note the area name (the `###` heading above each task group) and layer (the `##` heading)
- Note any `*(depends on: ...)*` annotations for dependency enforcement

Apply the filter to select the working subset.

Report the plan before starting:

```
Plan: <plan-file-path>
Tasks: <tasks-file-path>
Story: <story-file-path> (<N> acceptance criteria)
Tasks selected: <N> (<Red> Red, <Green> Green, <Refactor> Refactor)
Already complete: <M> tasks skipped
```

If zero open tasks remain **and** the filter is `all`, skip to Step 4 — the
verification loop still has to run.

---

## Step 2 — Determine Execution Order and Parallelism

From the tasks file structure, identify:

1. **Sequential chains within each area:** Red → Green → Refactor (never skip or reorder)
2. **Parallel groups:** areas in the same layer that have no cross-area dependencies
3. **Cross-layer blockers:** a downstream area's Red task cannot start until the upstream area's Green task is checked off

**Dependency guard:** Before executing any `[Green]` task, verify its paired `[Red]` task is checked off (`[x]`). If not, warn the user and stop — do not silently execute Green without confirmed Red coverage.

**Parallel execution:** When multiple areas in the same layer are all unblocked, announce that they can be dispatched as parallel agents:

```
Layer N has <M> areas ready to run in parallel:
  - {Area 1}: [Red] task
  - {Area 2}: [Red] task
  - {Area 3}: [Red] task

Dispatching parallel agents...
```

Each agent receives:

- The area name
- The specific task description (file paths, function signatures, test cases from tasks.md)
- The skill to invoke (`/red`, `/green`, or `/refactor`)
- Instructions to check off the task in tasks.md when complete

Note: `[Refactor]` tasks **must** be handled in the main conversation, not delegated —
subagents cannot invoke the `/refactor` skill.

---

## Step 3 — Execute Each Task

For tasks that cannot be parallelized (sequential within an area, or single-area layers), work through them one at a time.

### 3a — Announce

Print a clear header:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Phase] Area: <subject>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3b — Extract Context from tasks.md and plan.md

From the tasks.md entry, extract:

- Specific file paths to create or modify
- Function signatures, schema shapes, test cases
- Validation rules and business logic

From the plan, pull any additional architectural guidance for this area.

### 3c — Invoke the Correct Skill

**For `[Red]` tasks** — use the `/red` skill:

- Pass: test file path, specific test cases, plan path for reference
- Goal: tests written and confirmed failing

**For `[Green]` tasks** — use the `/green` skill:

- Pass: implementation file path, paired test file, specific logic from plan
- Goal: all paired tests passing; no extra logic

**For `[Refactor]` tasks** — use the `/refactor` skill:

- Pass: file(s) to clean up, test file to keep green
- Goal: code quality improved; behaviour unchanged; tests still green

### 3d — Verify

| Phase    | Command                                    | Expected outcome                        |
| -------- | ------------------------------------------ | --------------------------------------- |
| Red      | `pnpm test`                                | Tests **fail** (missing implementation) |
| Green    | `pnpm test`                                | Tests **pass**                          |
| Refactor | `pnpm test && pnpm lint && pnpm typecheck` | All **pass**                            |

If Red tests pass instead of fail: implementation may already exist — note this and continue.

If Green or Refactor fail: diagnose, fix, re-run. If unresolvable, describe the blocker and pause.

### 3e — Check Off the Task

When verification passes, update tasks.md by changing `- [ ]` to `- [x]` for the completed task:

```
- [x] **[Green]** Implement — `src/main/core/lifecycle.ts` *(depends on: Lifecycle Red ✓)*
```

---

## Step 4 — Verification Loop

**Run gates A–E in order. On the first failure, remediate and restart the loop from
Gate A** — a fix for one gate routinely breaks another, so gates are never assumed
still-passing from a prior cycle.

**Cycle cap: 3.** Track the cycle count. If the same gate fails on cycle 3, stop and
report the blocker (see "Loop exhaustion" below) instead of trying a fourth time.

### Gate A — Tasks complete

Every task in tasks.md is `- [x]`. If any remain open, return to Step 3 for them.

### Gate B — Suite green

```bash
pnpm test && pnpm lint && pnpm typecheck
```

All three must pass. Any failure → fix and restart the loop.

If the typecheck fix you are reaching for is a cast, an `as unknown as`, a widened type,
or an `any`, stop and invoke `/typescript-magician` instead. Satisfying the compiler by
loosening a type passes this gate while hiding the defect from every later one.

### Gate C — Acceptance criteria covered by e2e tests

```bash
pnpm test:e2e
```

For **each** AC extracted in Step 1, find the e2e test that exercises it and confirm
that test **actually ran and passed** in the output above — a matching `it()` name in
the source is not sufficient evidence, a skipped or filtered-out test fails this gate.

Print the audit:

```
AC Audit (cycle <n>):
  ✓ AC-1: <ac text> → e2e/<file>.ts › it('<test name>')  PASS
  ✓ AC-2: <ac text> → e2e/<file>.ts › it('<test name>')  PASS
  ✗ AC-3: <ac text> → NO E2E TEST
```

Any `✗` → write the missing e2e test through the `/red` → `/green` cycle, add it to
tasks.md as a checked task, and restart the loop.

If an e2e test fails and the assertion output does not explain why, invoke `/debug-app`
to reproduce the step in the running app with the main-process pino logs alongside it.
The e2e runner and the code reviewer cannot see those logs. Stop the debug-app session
before rerunning `pnpm test:e2e`, so nothing holds port 9222.

If an AC is genuinely not e2e-testable (a non-observable internal invariant), say so
explicitly, name the unit/integration test that covers it instead, and mark it
`✓ (unit: <path>)`. Do not use this escape hatch for anything a user can observe in
the UI.

> **better-sqlite3 ABI note:** pnpm skips `pre*` hooks, so the rebuild is manual. Run
> `pnpm rebuild:node` before `pnpm test` and `pnpm rebuild:electron` before
> `pnpm test:e2e` whenever you switch between them. The wrong-ABI symptoms are
> `NODE_MODULE_VERSION <n> ... requires <m>` from Vitest, or an e2e hang on
> `waiting for event 'window'`.

### Gate D — 95% coverage on changed code

Collect coverage:

```bash
pnpm test --coverage.enabled --coverage.reporter=json-summary --coverage.reporter=text
```

Determine the changed-code set:

```bash
git diff --name-only HEAD                    # staged + unstaged
git diff --name-only main...HEAD             # already committed on this branch
```

Take the union, then keep only files matching `src/**/*.ts` or `src/**/*.tsx`,
excluding `*.test.ts(x)`, `*.spec.ts(x)`, `*.d.ts`, `src/preload/**`,
`src/main/index.ts`, and `src/renderer/src/main.tsx` (these mirror the `coverage.exclude`
list in `vitest.config.ts`).

Read `coverage/coverage-summary.json` and, for each file in the set, check
`lines.pct >= 95` **and** `branches.pct >= 95`.

Print the report:

```
Coverage Gate (cycle <n>) — threshold 95% lines + branches
  ✓ src/main/services/screener.ts        lines 100.0  branches  96.4
  ✗ src/renderer/src/hooks/useScreen.ts  lines  88.2  branches  75.0
      uncovered lines: 41-47, 63
```

Any `✗` → write tests for the uncovered lines/branches through `/red` → `/green`, then
restart the loop. Do **not** close the gap by deleting code, loosening the threshold, or
adding the file to `coverage.exclude`. If a branch is genuinely unreachable, delete the
dead branch rather than test it — and say so in the report.

### Gate E — No surviving mutants on changed core lines

Coverage proves a line ran; it does not prove a test would notice the line being wrong.
Take the Gate D changed-code set and keep only `src/main/core/**/*.ts` (no tests, no
`test-fixtures/`). If that set is empty, print `Mutation Gate: skipped — no core changes`
and continue.

Otherwise run Stryker over those files (comma-separated). It runs the pure core suites
only, so it needs no sqlite rebuild:

```bash
pnpm test:mutation --mutate src/main/core/<a>.ts,src/main/core/<b>.ts
```

List every `Survived` and `NoCoverage` mutant from `reports/mutation/mutation.json`:

```bash
jq -r '.files | to_entries[] | .key as $f | .value.mutants[]
  | select(.status == "Survived" or .status == "NoCoverage")
  | "\($f):\(.location.start.line)  \(.mutatorName)  → \(.replacement // "")"' \
  reports/mutation/mutation.json
```

A mutant **blocks** when its line falls inside a hunk this branch added or changed
(`git diff -U0 main...HEAD` plus uncommitted changes). Survivors on untouched lines are
pre-existing debt: list them as advisory in the final report, do not fix them here.

Print the report:

```
Mutation Gate (cycle <n>) — changed core lines
  ✓ src/main/core/pmcc-rules.ts   score 94.1   0 blocking survivors
  ✗ src/main/core/alerts.ts       score 81.3   2 blocking survivors
      alerts.ts:271  EqualityOperator  lte → lt
      alerts.ts:262  ConditionalExpression  → false
```

Any `✗` → write a test that kills each blocking mutant through `/red` → `/green` (it passes
against the real code by design; the proof is the re-run showing `Killed`), then restart
the loop. Never kill a mutant by changing production code. A mutant that cannot change
behaviour (equivalent) may be disabled with `// Stryker disable next-line <Mutator>: <reason>`
— list each one in the final report so the user can check the reasoning.

### Loop exhaustion

If cycle 3 ends with a gate still failing, stop and print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
implement-plan BLOCKED after 3 verification cycles
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Failing gate: <A|B|C|D|E>
What was attempted each cycle: <one line per cycle>
Why it did not resolve: <diagnosis>
Suggested next step: <concrete action for the user>
```

Leave the work in place; do not revert. Do not proceed to Step 5.

---

## Step 5 — Code Review Loop (fresh-context subagent)

Only after all five gates pass. The reviewer **must not** be a fork of this
conversation — it reviews the diff cold, with no memory of why any decision was made,
so implementation rationale cannot paper over a real defect.

### 5a — Dispatch

Use the Agent tool with `subagent_type: "pr-review-toolkit:code-reviewer"`. The prompt
contains **only** artifacts the reviewer can read for itself:

- The story file path and its verbatim AC list
- The plan file path
- The exact diff scope: `git diff main...HEAD` plus any uncommitted changes
- `CLAUDE.md` as the standards reference

Ask it for four things, in this order:

1. **AC verification** — for each AC, is it actually implemented and correct? Judge the
   code, not the test names. Flag any AC that is only superficially satisfied.
2. **Bugs** — correctness defects, unhandled edge cases, silent failures, broken
   invariants, violations of the Architecture Rules in `CLAUDE.md` (pure `core/`
   engines, thin IPC handlers, linked roll pairs, hash routing, RHF+Zod forms,
   Tailwind `wb-*` tokens, per-item failure isolation in batch jobs). Treat an unsafe
   cast, `as unknown as`, `any`, or a type widened only to satisfy the compiler as a bug.
3. **Type design** — read `.agents/skills/typescript-advanced-types/SKILL.md` and the
   plan's `data-model.md` § Type Design, then judge every type the diff adds or changes.
   - **Blocking:**
     - a type admits a state that the domain or an AC forbids, e.g. optional fields
       where a discriminated union is needed
     - a type departs from the Type Design without a recorded reason
     - two layers hand-copy a shape that one of them could derive
   - **Advisory:** stylistic type improvements.
4. **Refactor opportunities visible only at the whole-feature level** — duplication
   across the layers this plan touched, an abstraction the layer-by-layer TDD passes
   could not see, a seam that is now obviously in the wrong place. Explicitly _not_
   speculative flexibility (see Simplicity First in `CLAUDE.md`).

5. **Test quality** — judge every test the diff adds or changes against `CLAUDE.md`
   § Test Quality Checklist.
   - **Blocking:**
     - a test that cannot fail: an assertion a plausible wrong implementation still
       satisfies, a `try/catch` with no `expect.fail`, a test with no assertion, a
       renderer assertion that a mocked child or placeholder text satisfies
     - a test that reads the real clock, so its inputs change from day to day
     - red-phase scaffolding left in place: `{ fn?: … }` casts, `?.()` calls, "exports X" tests
   - **Advisory:** duplicate tests, test IDs where a role and name would do, repeated setup.

Require each finding to carry a severity: `blocking` (AC gap, bug, type-design defect, or a
test that cannot fail) or `advisory` (refactor opportunity, test readability).

### 5b — Triage

- **Blocking findings** → fix them, test-first: write a failing test that reproduces the
  defect, make it pass, then **return to Step 4 and re-run the whole verification loop**.
  A fix can break a gate.
- **Advisory findings** → do not apply them. Collect them for the final report so the
  user decides.

### 5c — Re-review

After fixing blocking findings and re-passing Step 4, dispatch a **new** reviewer agent
(not a continuation of the first — it now has the earlier review in its context) over
the updated diff. Repeat until a review returns zero blocking findings.

**Cycle cap: 3 reviews.** If the third review still returns blocking findings, stop with
the exhaustion report from Step 4, listing the unresolved findings.

---

## Step 6 — Documentation

Only after a clean review.

### 6a — Implementation doc

Create or update `docs/<plan-file-stem>-implementation.md`:

- Feature implemented (purpose, scope, behavior)
- Key files/components changed
- At least one Mermaid diagram

### 6b — Spec wiki

Run `/update-spec <plan-name>` so the change lands in `docs/spec/` before the plan docs
age out. This re-extracts the plan dir and refreshes only the topic/feature pages it
drives.

### 6c — Formatting

```bash
pnpm format
```

Then re-run `pnpm lint && pnpm typecheck` — formatting a large diff has been known to
surface lint errors.

---

## Step 7 — Final Report

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
implement-plan complete — <plan-name>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tasks completed:     <N>
Verification cycles: <n>   (all gates green)
Review cycles:       <n>   (0 blocking findings)

AC coverage:   <N>/<N> covered by passing e2e tests
Code coverage: <N>/<N> changed files ≥95% lines + branches
Mutation:      <N>/<N> changed core files with 0 blocking survivors (or "skipped — no core changes")
Suite:         test ✓  lint ✓  typecheck ✓  e2e ✓

Docs updated:  docs/<stem>-implementation.md, docs/spec/<pages>

Advisory findings not applied (<N>):
  - <finding> — <file:line>

Equivalent mutants disabled (<N>):
  - <file:line> <Mutator> — <reason>

Pre-existing surviving mutants in touched core files (<N>):
  - <file:line> <Mutator>
```

If the run was a filtered slice (Step 0), print instead:

```
Slice complete: <filter>. Gates not run — they require a full `all` run.
To continue: /implement-plan <plan-file> <next-filter>
```
