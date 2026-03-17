---
description: Implements tasks from a plan file in TDD order (Red → Green → Refactor → Documentation). Reads the plan and beads issues, executes each task using the appropriate skill, verifies correctness, marks tasks complete in beads. Optionally filter to a phase or task range.
argument-hint: <us-id|plan-file-path> [all|red|green|refactor|<N>|<N>-<M>]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Skill
---

# implement-plan command

The user has invoked `/implement-plan` with arguments: `$ARGUMENTS`

---

## Step 0 — Parse Arguments

Split `$ARGUMENTS` on the first space:
- **First token** = story ID or plan file path (required)
- **Filter** = the second token (optional, default: `all`)

**Resolve the plan file path:**
- If the first token looks like a story ID (e.g. `us-4`, `us-12`) → derive the path as `plans/<id>/plan.md`
- Otherwise treat it as a literal file path

Valid filter values:
- `all` — every open task
- `red` — only `[Red]` tasks
- `green` — only `[Green]` tasks
- `refactor` — only `[Refactor]` tasks
- A single integer (e.g. `3`) — only that numbered task
- A range (e.g. `2-7`) — tasks at those positions (inclusive)

---

## Step 1 — Load the Plan and Beads Tasks

1. Use Read to load the plan file at the given path. If it does not exist, stop and tell the user: "File not found: `<path>`"

2. Run `bd ready` to list tasks that are ready to work (no blockers). Also run `bd list --status=open` to see all open tasks related to this plan.

3. Identify the beads issues for this plan by looking at the issue titles — they should reference the plan's feature areas (e.g. `[Red]`, `[Green]`, `[Refactor]` tasks). If no beads issues exist, stop and tell the user:
   > "No beads tasks found. Run `/plan-tasks <plan-file>` first to generate them."

---

## Step 2 — Build the Execution Set

List all beads tasks related to this plan. Each task has:
- A beads ID (e.g. `wheelbase-ink.4.1`)
- A phase tag in the title: `[Red]`, `[Green]`, or `[Refactor]`
- A status: `open`, `in_progress`, or `closed`

Skip any task whose status is `closed` (already complete).

Number tasks sequentially by their beads ID order (counting both closed and open so numbers are stable).

Apply the filter to select the open subset.

**Enforce this execution order across the full selected set:**
1. All selected `[Red]` tasks — in beads ID order
2. All selected `[Green]` tasks — in beads ID order
3. All selected `[Refactor]` tasks — in beads ID order
4. Documentation step — after task execution completes

**Dependency guard:** Before running any `[Green]` task, verify its paired `[Red]` task is `closed` in beads. If it is not (and was not just completed in this run), warn the user and ask whether to proceed or skip. Do not silently execute Green work without confirmed Red coverage.

Report the plan before starting:
```
Plan: <plan-file-path>
Tasks selected: <N> (<Red count> Red, <Green count> Green, <Refactor count> Refactor)
Already complete: <M> tasks skipped
```

If zero tasks are selected (all are already closed), tell the user and stop.

---

## Step 3 — Execute Each Task

Work through the execution set in the order determined in Step 2. For each task:

### 3a — Announce and Claim

Print a clear header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task <current> of <total selected>: [Phase] <subject>
Beads: <id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Mark the task in progress:
```bash
bd update <id> --status=in_progress
```

### 3b — Extract Context from the Plan

Read the plan to find the section(s) relevant to this task. Extract:
- Specific file paths to create or modify
- Function signatures, dataclass fields, or schema shapes
- Validation rules, formulas, or business logic
- Test cases or acceptance criteria explicitly called out
- Any "tests first" or dependency notes

Also run `bd show <id>` to pull any additional context stored in the beads issue.

This context is what you pass to the skill — do not skip it.

### 3c — Invoke the Correct Skill

**For `[Red]` tasks** — use the `/red` skill:
- Pass: the test file path, the specific test cases from the plan, and the plan path for reference.
- Tell the skill: these tests must be written and confirmed **failing** before this step is done.

**For `[Green]` tasks** — use the `/green` skill:
- Pass: the implementation file path, the paired test file as the acceptance bar, and the specific logic from the plan.
- Tell the skill: done when all paired tests pass; do not add logic not required by the tests.

**For `[Refactor]` tasks** — use the `/refactor` skill:
- Pass: the file(s) to clean up and the test file to keep green.
- Tell the skill: look for naming, duplication, structure issues; behaviour must not change.

### 3d — Verify

Run the appropriate check after the skill completes:

| Phase | Command to run | Expected outcome |
|---|---|---|
| Red | `pnpm test` | Tests **fail** (they define behaviour not yet implemented) |
| Green | `pnpm test` | Tests **pass** |
| Refactor | `pnpm test` | Tests still **pass** |

**If Red tests pass instead of fail:** The implementation may already exist. Note this, keep the task marked complete, and continue — do not treat it as a failure.

**If Green or Refactor tests fail:** Do not mark the task complete. Diagnose the failure, fix it, re-run. If you cannot resolve it in one attempt, describe the blocker to the user and pause.

After Green and Refactor tasks, also run:
```bash
pnpm lint && pnpm typecheck
```
Fix any errors before marking the task complete.

### 3e — Mark Complete in Beads

When verification passes, close the beads task:
```bash
bd close <id>
```

---

## Step 4 — Write Implementation Documentation

After all selected tasks finish, add a documentation file in the `docs/` folder describing what was implemented.

- Create or update: `docs/<plan-file-stem>-implementation.md`
- Include:
  - The feature implemented (purpose, scope, and behavior)
  - Key files/components changed
  - Process explanation of what was created
  - At least one diagram that helps understanding (use Mermaid when appropriate)

If the selected set contains only `[Red]` tasks, skip this step.

---

## Step 5 — AC Audit

Before reporting success, re-read the user story's acceptance criteria and verify every AC is covered by a closed e2e test.

1. Locate the user story file (from the plan's Supporting Documents section).
2. List every AC bullet.
3. For each AC, name the specific `it('...')` test in the e2e test file that covers it.
4. If any AC has no corresponding closed e2e test, do not mark the plan complete — create or reopen the missing test and run it through the Red → Green cycle first.

Print the audit result:
```
AC Audit:
  ✓ AC-1: <ac text> → it('<test name>')
  ✓ AC-2: <ac text> → it('<test name>')
  ✗ AC-3: <ac text> → NO E2E TEST — blocked
```

Only proceed to Step 6 when every AC has a ✓.

---

## Step 6 — Final Report and Session Close

After the AC audit passes, run the full suite:
```bash
pnpm test && pnpm lint && pnpm typecheck
```

Report whether the suite is clean. If anything fails, show the output and describe what needs fixing — do not mark the overall run as successful if the suite is red.

Sync beads and commit:
```bash
bd dolt pull
git add <changed files>
git commit -m "<summary of what was implemented>"
```

Print the final report:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
implement-plan complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Completed: <N> tasks
Remaining: <M> open tasks
```

If tasks remain in other phases, tell the user the command to continue:
```
To continue: /implement-plan <plan-file> green
```
