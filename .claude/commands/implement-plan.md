---
description: Implements tasks from a plan file in TDD order (Red → Green → Refactor → Documentation). Reads the plan and companion .tasks.md file, executes each task using the appropriate skill, verifies correctness, marks tasks complete, and writes implementation docs. Optionally filter to a phase or task range.
argument-hint: <plan-file-path> [all|red|green|refactor|<N>|<N>-<M>]
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
- **Plan file path** = the first token (required)
- **Filter** = the second token (optional, default: `all`)

Valid filter values:
- `all` — every unchecked task
- `red` — only `[Red]` unchecked tasks
- `green` — only `[Green]` unchecked tasks
- `refactor` — only `[Refactor]` unchecked tasks
- A single integer (e.g. `3`) — only that numbered task
- A range (e.g. `2-7`) — tasks at those positions (inclusive)

---

## Step 1 — Load the Plan and Tasks File

1. Use Read to load the plan file at the given path. If it does not exist, stop and tell the user: "File not found: `<path>`"

2. Derive the tasks file path by replacing the `.md` extension with `.tasks.md` (e.g. `plans/my-plan.md` → `plans/my-plan.tasks.md`). Use Read to load it.

3. If the tasks file does not exist, stop and tell the user:
   > "No tasks file found at `<derived-path>`. Run `/plan-tasks <plan-file>` first to generate it."

---

## Step 2 — Build the Execution Set

Parse the tasks file. Each task is a line matching one of:
- `- [ ] [Red] <subject>` — unchecked
- `- [ ] [Green] <subject>` — unchecked
- `- [ ] [Refactor] <subject>` — unchecked
- `- [x] [Phase] <subject>` — already complete, skip

Number tasks sequentially by document order (1, 2, 3, …), counting both checked and unchecked lines so numbers are stable.

Apply the filter to select the unchecked subset.

**Enforce this execution order across the full selected set:**
1. All selected `[Red]` tasks — in their document order
2. All selected `[Green]` tasks — in their document order
3. All selected `[Refactor]` tasks — in their document order
4. Documentation step — after task execution completes

**Dependency guard:** Before running any `[Green]` task, verify its paired `[Red]` task is already checked (`[x]`) in the tasks file. If it is not (and was not just completed in this run), warn the user and ask whether to proceed or skip. Do not silently execute Green work without confirmed Red coverage.

Report the plan before starting:
```
Plan: <plan-file-path>
Tasks selected: <N> (<Red count> Red, <Green count> Green, <Refactor count> Refactor)
Already complete: <M> tasks skipped
```

If zero tasks are selected (all are already checked), tell the user and stop.

---

## Step 3 — Execute Each Task

Work through the execution set in the order determined in Step 2. For each task:

### 3a — Announce

Print a clear header:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Task <current> of <total selected>: [Phase] <subject>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 3b — Extract Context from the Plan

Read the plan to find the section(s) relevant to this task. Extract:
- Specific file paths to create or modify
- Function signatures, dataclass fields, or schema shapes
- Validation rules, formulas, or business logic
- Test cases or acceptance criteria explicitly called out
- Any "tests first" or dependency notes

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
| Red | `cd backend && python -m pytest <test-file> -v` (or frontend equivalent) | Tests **fail** (they define behaviour not yet implemented) |
| Green | `cd backend && python -m pytest <test-file> -v` (or frontend equivalent) | Tests **pass** |
| Refactor | Same test command as the paired Green task | Tests still **pass** |

**If Red tests pass instead of fail:** The implementation may already exist. Note this, keep the task marked complete, and continue — do not treat it as a failure.

**If Green or Refactor tests fail:** Do not mark the task complete. Diagnose the failure, fix it, re-run. If you cannot resolve it in one attempt, describe the blocker to the user and pause.

After all backend work in a session, also run `make lint` and `make typecheck` if applicable.

### 3e — Mark Complete

When verification passes, use Edit to update the tasks file: change `- [ ] [Phase] <subject>` → `- [x] [Phase] <subject>` for exactly this task (match on the full subject line).

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

## Step 5 — Final Report

After all selected tasks are processed, print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
implement-plan complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Completed: <N> tasks
Remaining: <M> tasks in <tasks-file-path>
```

If all Green and Refactor tasks in the selected set are complete, run the full suite:
```bash
make test && make lint && make typecheck
```

Report whether the suite is clean. If anything fails, show the output and describe what needs fixing — do not mark the overall run as successful if the suite is red.

If tasks remain in other phases, tell the user the command to continue:
```
To continue: /implement-plan <plan-file> green
```
