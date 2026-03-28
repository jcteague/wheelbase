---
description: Reads a plan file and creates a tasks.md checklist with TDD Red/Green/Refactor tasks, dependency notes, and parallel execution groups.
argument-hint: <plan-file-path>
allowed-tools:
  - Read
  - Write
---

# plan-tasks command

The user has invoked `/plan-tasks` with: `$ARGUMENTS`

---

## Step 1 — Read the Plan and Supporting Documents

Read the file at: `$ARGUMENTS`

If not found, stop: "File not found: `$ARGUMENTS`"

Derive the story directory from the plan path (e.g., `plans/us-3/plan.md` → `plans/us-3/`). Read each supporting document that exists:

| File | Read for |
|---|---|
| `{story-dir}/research.md` | Design decisions, architectural notes |
| `{story-dir}/data-model.md` | Field types, nullability, validation |
| `{story-dir}/contracts/*.md` | API shapes, response formats, error codes |

---

## Step 2 — Identify Functional Areas

Scan the plan's implementation steps. Group them into logical functional areas — each becomes one section in the task list. Common areas for this project:

- Types / enums module
- Core engine function (lifecycle, costbasis)
- Database migration
- Service layer
- IPC handler
- Renderer API client / hooks
- UI components
- Pages
- E2E tests

The plan's implementation order determines cross-area dependency order.

---

## Step 3 — Assign Parallel Layers

Analyze the dependency graph across functional areas and group them into parallel layers:

- **Layer 1** — areas with no cross-area dependencies (can start immediately)
- **Layer 2** — areas that depend on Layer 1 completions
- **Layer N** — areas that depend on Layer N-1 completions

Within each layer, all areas can be worked in parallel by independent agents.

Within each area, tasks are always sequential: Red → Green → Refactor.

Cross-area dependencies are always on the **Green** task of the upstream area (implementation must exist before downstream tests can be written).

---

## Step 4 — Write tasks.md

Create `{story-dir}/tasks.md` with the following structure:

```markdown
# {Story ID} — {Story Title} — Tasks

## How to Use

- Check off tasks as they complete: change `[ ]` to `[x]`
- Tasks within each area run **sequentially**: Red → Green → Refactor
- Areas in the same layer run **in parallel** — dispatch separate agents for each
- Cross-area dependencies are noted inline; do not start a task until its dependency is checked off

---

## Layer 1 — {description, e.g. "Foundation (no dependencies)"}

> These areas can be started immediately and run in parallel.

### {Area Name 1}

- [ ] **[Red]** Write failing tests — `{test-file-path}`
  - Test cases: {specific cases from plan}
  - Run `pnpm test {test-file}` — all new tests must fail
- [ ] **[Green]** Implement — `{impl-file-path}` *(depends on: {Area Name 1} Red ✓)*
  - {key function signatures and logic from plan}
  - Run `pnpm test {test-file}` — all tests must pass
- [ ] **[Refactor]** Clean up — `{impl-file-path}` *(depends on: {Area Name 1} Green ✓)*
  - Run `pnpm test && pnpm lint && pnpm typecheck`

### {Area Name 2}

- [ ] **[Red]** Write failing tests — `{test-file-path}`
  - Test cases: {specific cases from plan}
  - Run `pnpm test {test-file}` — all new tests must fail
- [ ] **[Green]** Implement — `{impl-file-path}` *(depends on: {Area Name 2} Red ✓)*
  - {key function signatures and logic from plan}
  - Run `pnpm test {test-file}` — all tests must pass
- [ ] **[Refactor]** Clean up *(depends on: {Area Name 2} Green ✓)*
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer 2 — {description, e.g. "Service + IPC (depends on Layer 1)"}

> These areas can run in parallel with each other **after** their Layer 1 dependencies are complete.

### {Area Name 3}

**Requires:** {Area Name 1} Green ✓

- [ ] **[Red]** Write failing tests — `{test-file-path}` *(depends on: {Area Name 1} Green ✓)*
  - Test cases: {specific cases}
  - Run `pnpm test {test-file}` — all new tests must fail
- [ ] **[Green]** Implement — `{impl-file-path}` *(depends on: {Area Name 3} Red ✓)*
  - {key details}
  - Run `pnpm test {test-file}` — all tests must pass
- [ ] **[Refactor]** Clean up *(depends on: {Area Name 3} Green ✓)*
  - Run `pnpm test && pnpm lint && pnpm typecheck`

---

## Layer N — E2E Tests

**Requires:** All Green tasks from previous layers ✓

### E2E Tests

- [ ] **[Red]** Write failing e2e tests — `e2e/{story-slug}.spec.ts` *(depends on: all Green tasks ✓)*
  - One `it()` per AC bullet from the user story — test names must mirror AC language
  - AC coverage:
    - AC-1: {ac text} → `it('{test name}')`
    - AC-2: {ac text} → `it('{test name}')`
  - Run `pnpm test:e2e` — all new tests must fail
- [ ] **[Green]** Make e2e tests pass *(depends on: E2E Red ✓)*
  - Run `pnpm test:e2e` — all tests must pass
- [ ] **[Refactor]** Clean up e2e tests *(depends on: E2E Green ✓)*

---

## Completion Checklist

- [ ] All Red tasks complete (tests written and failing for right reason)
- [ ] All Green tasks complete (all tests passing)
- [ ] All Refactor tasks complete (lint + typecheck clean)
- [ ] E2E tests cover every AC
- [ ] `pnpm test && pnpm lint && pnpm typecheck` — all clean
```

---

## Step 5 — Report

Print a summary:

```
Created: {story-dir}/tasks.md

Layers: N
  Layer 1: {area names} — parallel, start immediately
  Layer 2: {area names} — parallel, after Layer 1 Green tasks
  ...

Tasks: N total (N Red, N Green, N Refactor)
Spec: $ARGUMENTS

Next: /implement-plan $ARGUMENTS
```
