---
name: Beads Plan Tracking
description: This skill should be used when the user asks to "create beads tasks from a plan", "track plan tasks in beads", "create epics and stories in beads", "convert a plan to beads issues", "set up beads hierarchy for a plan", "create beads tasks with dependencies", or "store plan tasks using bd". Guides creating a hierarchical beads issue structure (epic → feature → tasks) from a plan file, with TDD task structure, skill references, and verified dependency wiring.
version: 0.1.0
---

# Beads Plan Tracking

Transform a plan file into a verified beads issue hierarchy that persists across sessions, preserves actionable context in each issue, and enforces correct TDD ordering via dependencies.

## Core Philosophy

Beads track **what to do** and **dependencies**. Plan documents capture **how** and **why**. Never duplicate the full spec into descriptions — link back via `--spec-id`. Descriptions are action-oriented summaries; deep context lives in the plan files.

## Hierarchy

```
Epic  (type=epic)      — the user story
└── Feature (type=feature) — one per functional area
    ├── Task [Red]     — write failing tests
    ├── Task [Green]   — implement to pass tests
    └── Task [Refactor] — clean up without breaking
```

Group by **functional area**, not by TDD phase. This keeps related Red/Green/Refactor under one parent and makes `bd show <feature-id>` show complete area status.

## Field Mapping

| Plan source                    | Beads field                            | Notes                                      |
| ------------------------------ | -------------------------------------- | ------------------------------------------ |
| Story title + ID               | `--title` on epic                      | e.g., "US-3 — List Positions"              |
| Plan `## Context` section      | `--description` on epic                | Brief story summary                        |
| Plan file path                 | `--spec-id` on all tasks               | Primary link to full spec                  |
| `research.md`                  | `--design` on features and Green tasks | The _why_ — architectural decisions        |
| `data-model.md` + `contracts/` | `--description` on tasks               | Key file paths, function sigs, field types |
| `quickstart.md`                | `--acceptance` on tasks                | Exact test command and expected result     |
| TDD phase                      | `--labels` + title prefix              | `red`, `green`, or `refactor` label        |

## Task Descriptions — What to Include

Each task description must be **sufficient to start work cold** but not a spec dump:

**Red task** — always starts: `"Use the /red skill."`

- Test file path
- Specific test cases (function/input/expected output level)
- Key validation rules being tested
- How to confirm tests fail: `Run: pnpm test <file>`

**Green task** — always starts: `"Use the /green skill."`

- Implementation file path
- Paired test file (acceptance bar)
- 3–5 critical implementation details (function signature, field types, validation logic)
- Minimum code only — no extra logic

**Refactor task** — always starts: `"Use the /refactor skill."`

- Files to review
- Specific things to look for: naming, duplication, function length (>20 lines), log levels
- Constraint: behaviour unchanged, tests stay green

## Dependency Wiring

**Within each feature area (always):**

```bash
bd dep add <green-id> <red-id>       # Green depends on Red
bd dep add <refactor-id> <green-id>  # Refactor depends on Green
```

**Cross-feature (follow plan's implementation order):**
Wire the **downstream Red** task to the **upstream Green** task. This ensures prerequisite implementations exist before downstream tests are written.

```bash
# IPC handler Red depends on service layer Green
bd dep add <ipc-red-id> <service-green-id>
```

**Parallel features** (no ordering constraint in plan): No cross-feature deps needed. Both will appear in `bd ready` simultaneously.

## Verification (Required)

After all dependencies are wired, verify the graph:

```bash
bd graph <epic-id> --json
```

Check `layout.Layers`:

- Layer 0: first Red task(s) — nothing blocking them
- Each subsequent layer depends on the previous
- Parallel tasks appear in the same layer

Fix any missing deps, then re-run until the graph matches the plan's implementation order.

## Acceptance Fields

Acceptance must be unambiguous — always includes the exact command:

- Red: `"All new tests failing. Run: pnpm test <test-file>"`
- Green: `"pnpm test <test-file> passes. pnpm typecheck and pnpm lint clean."`
- Refactor: `"pnpm test still passes. pnpm lint and pnpm typecheck clean."`

## After Creation

Report a concise tree summary:

```
Epic: <title> (<epic-id>)
  └── <Feature area> (<feature-id>)
      ├── [Red]     <id> — ready
      ├── [Green]   <id> — blocked by <red-id>
      └── [Refactor] <id> — blocked by <green-id>
  └── <Next feature> (<feature-id>)
      ...

Run: bd ready  (shows first available tasks)
```

## Quick Reference

```bash
bd ready                              # What can be worked now
bd graph <epic-id>                    # Dependency graph
bd epic status <epic-id>              # Completion %
bd show <id>                          # Full issue details
bd children <feature-id>              # Tasks under a feature
bd update <id> --status=in_progress   # Claim a task
bd close <id>                         # Mark complete
```

## Additional Resources

- **`references/beads-fields.md`** — Detailed field examples from this project's plan format
- **`references/dependency-patterns.md`** — Cross-feature dependency patterns for this project's stack layers
