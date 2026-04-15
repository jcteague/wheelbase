---
description: Implements tasks from a plan file in TDD order (Red → Green → Refactor → Documentation). Reads tasks.md, executes each task using the appropriate skill, verifies correctness, and checks off completed tasks. Optionally filter to a phase or layer.
argument-hint: <us-id|plan-file-path> [all|red|green|refactor|layer-N]
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

**Derive tasks file path:** same directory as the plan, named `tasks.md` (e.g. `plans/us-4/tasks.md`)

Valid filter values:

- `all` — every open task
- `red` — only `[Red]` tasks
- `green` — only `[Green]` tasks
- `refactor` — only `[Refactor]` tasks
- `layer-N` — only tasks in Layer N (e.g. `layer-1`, `layer-2`)

---

## Step 1 — Load the Plan and Tasks

1. Read the plan file. If it does not exist, stop: "File not found: `<path>`"
2. Read `tasks.md`. If it does not exist, stop:
   > "No tasks file found. Run `/plan-tasks <plan-file>` first to generate it."

Parse the tasks file to build the execution list:

- Each unchecked `- [ ]` line with `[Red]`, `[Green]`, or `[Refactor]` is an open task
- Each checked `- [x]` line is already complete — skip it
- Note the area name (the `###` heading above each task group) and layer (the `##` heading)
- Note any `*(depends on: ...)*` annotations for dependency enforcement

Apply the filter to select the working subset.

Report the plan before starting:

```
Plan: <plan-file-path>
Tasks: <plan-file-path>
Tasks selected: <N> (<Red> Red, <Green> Green, <Refactor> Refactor)
Already complete: <M> tasks skipped
```

If zero open tasks remain, tell the user and stop.

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

Use the `superpowers:dispatching-parallel-agents` skill to dispatch these. Each agent receives:

- The area name
- The specific task description (file paths, function signatures, test cases from tasks.md)
- The skill to invoke (`/red`, `/green`, or `/refactor`)
- Instructions to check off the task in tasks.md when complete

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

## Step 4 — Write Implementation Documentation

After all selected tasks finish, create or update `docs/<plan-file-stem>-implementation.md`:

- Feature implemented (purpose, scope, behavior)
- Key files/components changed
- At least one Mermaid diagram

Skip this step if the selected set contains only `[Red]` tasks.

---

## Step 5 — AC Audit

Before reporting success, re-read the user story's acceptance criteria and verify every AC is covered by a checked-off e2e test in tasks.md.

1. Locate the user story file (from the plan's context)
2. List every AC bullet
3. For each AC, confirm the matching `it('...')` in the e2e test file is complete
4. If any AC has no corresponding checked task, do not mark the plan complete — run the missing test through the Red → Green cycle first

Print the audit result:

```
AC Audit:
  ✓ AC-1: <ac text> → it('<test name>')
  ✓ AC-2: <ac text> → it('<test name>')
  ✗ AC-3: <ac text> → NO E2E TEST — blocked
```

Only proceed to Step 6 when every AC has a ✓.

---

## Step 6 — Final Report

Run the full suite:

```bash
pnpm test && pnpm lint && pnpm typecheck
```

Print the final report:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
implement-plan complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Completed: <N> tasks
Remaining: <M> open tasks
```

If tasks remain, tell the user the command to continue:

```
To continue: /implement-plan <plan-file> green
```
