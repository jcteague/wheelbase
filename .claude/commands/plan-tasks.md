---
description: Reads a plan file and creates a hierarchical beads issue structure (epic → feature → tasks) with TDD Red/Green/Refactor tasks, plan context, and verified dependency wiring.
argument-hint: <plan-file-path>
allowed-tools:
  - Read
  - Bash
---

# plan-tasks command

The user has invoked `/plan-tasks` with: `$ARGUMENTS`

Use the beads-plan skill throughout this workflow.

---

## Step 1 — Read the Plan and Supporting Documents

Read the file at: `$ARGUMENTS`

If not found, stop: "File not found: `$ARGUMENTS`"

Derive the story directory from the plan path (e.g., `plans/us-3/plan.md` → `plans/us-3/`). Read each supporting document that exists:

| File | Read for |
|---|---|
| `{story-dir}/research.md` | Design decisions → `--design` on features and Green tasks |
| `{story-dir}/data-model.md` | Field types, nullability, validation → task descriptions |
| `{story-dir}/contracts/*.md` | API shapes, response formats, error codes → task descriptions |
| `{story-dir}/quickstart.md` | Test commands, verification steps → `--acceptance` |

---

## Step 2 — Create the Epic

```bash
EPIC_ID=$(bd create \
  --type=epic \
  --title="<Story ID> — <Story Title from plan heading>" \
  --description="<Context section from plan — why this story exists and what it establishes>" \
  --labels="<story-id-slug>" \
  --priority=2 \
  --silent)
echo "Epic: $EPIC_ID"
```

---

## Step 3 — Identify Functional Areas

Scan the plan's implementation steps. Group them into logical functional areas — each becomes one feature issue. Common areas for this project:

- Types / enums module
- Core engine function (lifecycle, costbasis)
- Database migration
- Service layer
- IPC handler
- Renderer API client / hooks
- UI components
- Pages

The plan's implementation order determines cross-feature dependency order (Step 7).

---

## Step 4 — Create Feature Issues

For each functional area, in implementation order:

```bash
FEATURE_ID=$(bd create \
  --type=feature \
  --title="<functional area name>" \
  --parent=$EPIC_ID \
  --description="<What this area does and its role in the story. One short paragraph.>" \
  --design="<Relevant excerpt from research.md — why this approach, key architectural decisions>" \
  --spec-id="$ARGUMENTS" \
  --labels="<story-id-slug>,<area-slug>" \
  --priority=2 \
  --silent)
echo "Feature: $FEATURE_ID"
```

---

## Step 5 — Create Red/Green/Refactor Tasks per Feature Area

For each feature, create exactly three tasks. Capture all three IDs.

### Red task

```bash
RED_ID=$(bd create \
  --type=task \
  --title="[Red] Write failing tests for <specific thing>" \
  --parent=$FEATURE_ID \
  --description="Use the /red skill.

Test file: <path/to/test-file.ts>

Test cases:
- <specific case: function name, input values, expected output>
- <one test per validation rule from plan>
- <happy path case>

Run pnpm test and confirm all new tests fail before marking done." \
  --acceptance="All new tests failing. Run: pnpm test <test-file>" \
  --spec-id="$ARGUMENTS" \
  --labels="red,<story-id-slug>,<area-slug>" \
  --priority=2 \
  --silent)
echo "Red: $RED_ID"
```

### Green task

```bash
GREEN_ID=$(bd create \
  --type=task \
  --title="[Green] Implement <specific thing>" \
  --parent=$FEATURE_ID \
  --description="Use the /green skill.

Implementation file: <path/to/impl-file.ts>
Paired test file: <path/to/test-file.ts> (make these pass)

Key implementation details:
- <function signature with exact parameter and return types>
- <validation rule or business logic from plan>
- <field type / nullability from data-model.md>
- <response shape or constraint from contracts/>

Write minimum code to pass the paired tests. No extra logic." \
  --acceptance="pnpm test <test-file> passes. pnpm typecheck and pnpm lint clean." \
  --design="<Design decisions from research.md relevant to this implementation>" \
  --spec-id="$ARGUMENTS" \
  --labels="green,<story-id-slug>,<area-slug>" \
  --priority=2 \
  --silent)
echo "Green: $GREEN_ID"
```

### Refactor task

```bash
REFACTOR_ID=$(bd create \
  --type=task \
  --title="[Refactor] Clean up <specific thing>" \
  --parent=$FEATURE_ID \
  --description="Use the /refactor skill.

Files to review:
- <impl-file>
- <test-file>

Look for:
- Naming clarity and consistency with codebase conventions
- Duplication within or across these files
- Functions longer than 20 lines (extract)
- Type annotation completeness
- Log levels: INFO for business events, DEBUG for inputs/checkpoints (never in core/)

Behaviour must not change. Tests must stay green throughout." \
  --acceptance="pnpm test still passes. pnpm lint and pnpm typecheck clean." \
  --spec-id="$ARGUMENTS" \
  --labels="refactor,<story-id-slug>,<area-slug>" \
  --priority=3 \
  --silent)
echo "Refactor: $REFACTOR_ID"
```

---

## Step 6 — Wire Intra-Feature Dependencies

For each functional area, wire the Red → Green → Refactor chain:

```bash
bd dep add $GREEN_ID $RED_ID        # Green depends on Red
bd dep add $REFACTOR_ID $GREEN_ID   # Refactor depends on Green
```

---

## Step 7 — Wire Cross-Feature Dependencies

Following the plan's implementation order, wire each downstream area's Red task to the upstream area's Green task. This ensures prerequisite code exists before downstream tests are written.

```bash
# Example: service layer must be implemented before IPC handler tests can be written
bd dep add <ipc-red-id> <service-green-id>
```

If the plan shows no ordering constraint between two areas, leave them unlinked — they run in parallel.

---

## Step 8 — Verify the Dependency Graph

```bash
bd graph $EPIC_ID --json
```

Check `layout.Layers`:
- Layer 0: first Red task(s) — nothing blocking them
- Subsequent layers depend on previous
- Parallel areas appear in the same layer

Fix any incorrect dependencies, re-run until the graph matches the plan's implementation order. Do not report success until verification passes.

---

## Step 9 — Report

Print a concise tree:

```
Epic: <title> (<epic-id>)

  <Feature area> (<feature-id>)
    [Red]      <red-id>     — ready
    [Green]    <green-id>   — blocked by <red-id>
    [Refactor] <refactor-id> — blocked by <green-id>

  <Next feature> (<feature-id>)
    ...

Features: N  |  Tasks: M (N Red, N Green, N Refactor)
Spec: $ARGUMENTS

Next: bd ready
```
