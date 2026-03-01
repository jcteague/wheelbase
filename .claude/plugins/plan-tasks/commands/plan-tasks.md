---
description: Reads a plan or spec file and generates a structured task list. Creates TaskCreate entries in the todo list and writes a companion .tasks.md file in the same directory.
argument-hint: <file-path>
allowed-tools:
  - Read
  - Write
  - TaskCreate
---

# plan-tasks command

The user has invoked the `/plan-tasks` command with a file path argument: `$ARGUMENTS`

## Your job

Read the specified plan file, analyze its contents, and produce a concrete, actionable task list. Then:
1. Create each task using the TaskCreate tool
2. Write a companion markdown task file alongside the plan

## Step 1 — Read the plan file

Use the Read tool to read the file at: `$ARGUMENTS`

If the file does not exist, tell the user clearly: "File not found: `$ARGUMENTS`". Stop there.

## Step 2 — Break the plan into granular, actionable tasks

Study the plan carefully. Generate a full list of concrete, actionable tasks — as many as the plan's scope warrants (typically 15–40). Do NOT limit yourself to one task per work unit.

Think at the level of individual things to build, test, or fix — e.g., a single endpoint, a single model, a single business rule, a single UI component. Each task should be completable in one focused session.

**Task quality rules:**
- Each task must be **uniquely identifiable** — no two tasks share the same subject
- Tasks must be **concrete** — reference specific files, modules, classes, or endpoints, not vague nouns
- Order tasks by **natural dependency** — foundational work (models, schemas, core logic) before higher-level work (routes, UI, integrations)
- Do NOT create duplicate tasks or tasks that overlap in scope

## Step 3 — Assign every task a TDD phase

Every task belongs to one of three phases. Label each with a prefix:

**[Red] — write failing tests**
- The task is to write tests that define the expected behaviour and confirm they fail before any implementation exists.
- Subject pattern: `[Red] Write failing tests for <specific thing>`
- Description: Start with "Use the /red skill." Then name the test file/module, list the specific cases to cover, and state that tests must be run and confirmed failing before the paired Green task begins.
- activeForm pattern: `Writing failing tests for <specific thing>`

**[Green] — implement to pass tests**
- The task is to write the minimum code to make the paired Red tests pass. No gold-plating.
- Subject pattern: `[Green] Implement <specific thing>`
- Description: Start with "Use the /green skill." Then describe what to build. Reference the Red task's test file as the acceptance bar. Done when all those tests pass.
- activeForm pattern: `Implementing <specific thing>`

**[Refactor] — clean up**
- The task is to improve the implementation without changing behaviour. Tests must stay green throughout.
- Subject pattern: `[Refactor] Clean up <specific thing>`
- Description: Start with "Use the /refactor skill." Then describe what to look for — duplication, naming, readability, structure. If nothing warrants cleanup, this task is quick but still required.
- activeForm pattern: `Refactoring <specific thing>`

**Grouping rule:** Red → Green → Refactor tasks that cover the same specific thing form a natural group, but you are not limited to one group per work area. A complex endpoint might have several Red tasks, each with its own Green and Refactor counterpart.

## Step 4 — Create tasks using TaskCreate

Call the TaskCreate tool once per task. Order the calls so that all three phases for a given thing appear together (Red → Green → Refactor), and groups are ordered by dependency across the plan. Use all three fields: `subject`, `description`, and `activeForm`.

Example showing multiple tasks for one area (do not copy literally — generate tasks specific to the plan):
```
TaskCreate:
  subject: "[Red] Write failing tests for Wheel model fields"
  description: "Use the /red skill. In tests/test_models.py, write tests asserting the Wheel model has ticker, status, assignment_strike, created_at, updated_at. Run pytest and confirm all tests fail before proceeding."
  activeForm: "Writing failing tests for Wheel model"

TaskCreate:
  subject: "[Green] Implement Wheel SQLAlchemy model"
  description: "Use the /green skill. Define the Wheel model with all fields asserted in the Red tests. Done when tests/test_models.py passes."
  activeForm: "Implementing Wheel model"

TaskCreate:
  subject: "[Refactor] Clean up Wheel model definition"
  description: "Use the /refactor skill. Review field ordering, naming, and any duplication with other models. Tests must stay green."
  activeForm: "Refactoring Wheel model"

TaskCreate:
  subject: "[Red] Write failing tests for Wheel Alembic migration"
  description: "Use the /red skill. In tests/test_migrations.py, write a test that applies the migration against a test DB and asserts the wheels table has the correct schema. Confirm it fails before proceeding."
  activeForm: "Writing failing tests for Wheel migration"

TaskCreate:
  subject: "[Green] Write Alembic migration for Wheel model"
  description: "Use the /green skill. Generate and edit the migration so tests/test_migrations.py passes. Do not modify the model itself."
  activeForm: "Writing Wheel migration"

TaskCreate:
  subject: "[Refactor] Clean up Wheel migration file"
  description: "Use the /refactor skill. Check migration for correctness, comments, and consistency with other migrations. Tests must stay green."
  activeForm: "Refactoring Wheel migration"
```

## Step 5 — Write the companion markdown file

Derive the output file path from the input file path:
- Input: `phase-1-stories/epic.md` → Output: `phase-1-stories/epic.tasks.md`
- Input: `product documents/spec.md` → Output: `product documents/spec.tasks.md`
- Replace the file extension with `.tasks.md`

Use the Write tool to create this file with the following structure:

```markdown
# Tasks: <Plan Title>

Generated from: `<input file path>`
Generated: <today's date>
Total tasks: <N>

## Red — Write Failing Tests

- [ ] [Red] <subject of first Red task>
- [ ] [Red] <subject of second Red task>
...

## Green — Implement

- [ ] [Green] <subject of first Green task>
- [ ] [Green] <subject of second Green task>
...

## Refactor — Clean Up

- [ ] [Refactor] <subject of first Refactor task>
- [ ] [Refactor] <subject of second Refactor task>
...
```

## Step 6 — Report to the user

After completing all steps, summarize:
- Total tasks created and how they break down across Red / Green / Refactor
- The path to the companion markdown file
- Any ambiguities or gaps noticed in the plan (briefly)

Keep the summary concise — 3-5 lines.
