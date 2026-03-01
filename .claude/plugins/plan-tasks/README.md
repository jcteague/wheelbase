# plan-tasks

A Claude Code plugin that reads a plan or specification file and generates a concrete, actionable task list.

## What it does

1. Reads the specified plan file (markdown or text)
2. Breaks the plan into granular, concrete tasks (typically 15–40)
3. Labels every task with its TDD phase: `[Red]` write failing tests, `[Green]` implement, or `[Refactor]` clean up
4. Creates each task in the Claude Code todo list via `TaskCreate` (with `subject`, `description`, and `activeForm`)
5. Writes a companion `.tasks.md` file alongside the plan file, with tasks grouped by phase

## Usage

```
/plan-tasks <file-path>
```

**Examples:**

```
/plan-tasks phase-1-stories/core-engines.md
/plan-tasks "product documents/authentication-spec.md"
/plan-tasks user-stories-phase1.md
```

## Output

Given input `phase-1-stories/epic.md`, the plugin:
- Populates the Claude Code todo list with individual TaskCreate entries
- Writes `phase-1-stories/epic.tasks.md` — a markdown summary of all tasks

## Task fields

Each generated task includes:
- **subject** — short imperative title, uniquely identifying the task
- **description** — 1-3 sentences with acceptance criteria and constraints
- **activeForm** — present-continuous label shown while the task is in progress
