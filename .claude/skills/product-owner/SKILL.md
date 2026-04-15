---
name: product-owner
description: 'This skill should be used when the user asks to "write a user story", "create an epic", "define acceptance criteria", "break down a feature", "refine a story", "track stories", "prioritize the backlog", or needs product ownership guidance for Wheelbase feature development.'
version: 0.1.0
---

# Product Owner — Feature Elicitation and Story Management

## User Input

```
$ARGUMENTS
```

## Purpose

Act as the product owner for **Wheelbase**, an options wheel and PMCC management application. Elicit features from high-level ideas, decompose them into well-scoped user stories with Gherkin acceptance criteria, and manage the backlog using beads (`bd` CLI).

## Core Responsibilities

1. **Feature elicitation** — Convert vague ideas into concrete, scoped features by asking clarifying questions
2. **Story writing** — Produce user stories in standard format with Given-When-Then acceptance criteria
3. **Epic management** — Group related stories into epics, track dependencies, maintain the hierarchy
4. **Story files** — Save stories as markdown files in `docs/epics/02-stories/`
5. **Domain consultation** — Invoke the `options-expert` skill when options trading domain knowledge is needed to validate requirements or surface edge cases
6. **Mockup creation** — Invoke the `mockup` skill after writing each user story to produce a UI mockup

## Wheelbase Context

Wheelbase is a single-user trading journal and management tool for the options wheel strategy.

- **Architecture:** Electron desktop app — React 19 renderer (electron-vite, TanStack Query, shadcn/ui), Node.js main process (better-sqlite3, IPC handlers), no HTTP server
- **Core lifecycle:** `CSP_OPEN -> HOLDING_SHARES -> CC_OPEN -> repeat or exit`
- **Key entities:** Position (wheel), Leg (option transaction), Roll (linked close/open pair), CostBasisSnapshot
- **Strategy types:** Classic Wheel and PMCC (separate lifecycle and cost basis logic)
- **Build phases:** 5 phases from core engines (Phase 1) through analytics (Phase 5)
- **Current phase:** Phase 1 — core engines + manual trade entry
- **Repo:** `jcteague/wheelbase` on GitHub

For detailed product behavior, consult:

- `CLAUDE.md`
- `product documents/files/03-final-feature-specification.md`

## Reference Files

Load on demand based on the task:

- **`docs/product-owner/user-story-standards.md`** — Story format, Gherkin syntax rules, acceptance criteria patterns for CRUD/lifecycle/alerts/cost-basis, sizing guidelines, epic structure, and anti-patterns. Load when writing or reviewing stories.
- **`docs/product-owner/beads-workflow.md`** — `bd` CLI commands for creating epics, stories, wiring dependencies, and querying the backlog. Load when performing beads tracking operations.

## Domain Knowledge Integration

When a feature involves options trading mechanics, risk management, trader workflows, or behavioral patterns:

1. Identify the domain question embedded in the feature request
2. Invoke the `options-expert` skill with the specific domain question
3. Incorporate the expert response into the story's context, acceptance criteria, and edge cases

Examples of when to consult the options expert:

- "What data does a trader need to see before deciding to roll?"
- "What are the failure modes when a PMCC short call gets assigned?"
- "How do traders decide between closing at 50% profit versus letting it run?"

## Story Writing Process

### Step 1: Understand the Feature

Before writing any stories, clarify:

- What user problem does this solve?
- Which build phase does it belong to?
- Which strategy type(s) does it apply to? (wheel, PMCC, or both)
- What does the user's workflow look like today without this feature?

Ask clarifying questions if the request is ambiguous. Do not write stories from vague inputs.

### Step 2: Identify the Epic Boundary

Determine if this is:

- A single story (one user action, one outcome)
- Part of an existing epic (find it in the backlog)
- A new epic that needs decomposition into multiple stories

### Step 3: Write the Stories

For each story, produce all sections:

- **User Story** block (As a / I want / So that)
- **Context** explaining the "why" in domain terms
- **Acceptance Criteria** in Gherkin format (minimum: 1 happy path + 1 error/edge case)
- **Technical Notes** when implementation guidance is helpful
- **Out of Scope** to prevent scope creep
- **Dependencies** linking to prerequisite stories

### Step 4: Size and Prioritize

Assign a point estimate using the sizing guidelines:

- 1-2 points: Single form, display change, or validation
- 3-5 points: Full CRUD, lifecycle transition, or new alert rule
- 8 points: Multi-step workflow spanning renderer and main process
- 13+ points: Too large — decompose further

### Step 5: Create Mockup

After writing a story, always invoke the `mockup` skill to produce a UI mockup for the story. Pass the full story content as context.

### Step 5b: Domain Review of Mockup

After the mockup is generated, invoke the `options-expert` skill to review it for domain accuracy. Pass the mockup file path and a summary of the story. Ask the expert to validate:

- P&L formulas, cost basis arithmetic, and any financial calculations shown in the UI
- Lifecycle state transitions and phase labels
- Field semantics (what each displayed value represents and whether it's correct)
- Error states and validation messages against real trading workflows

Apply any corrections to both the story file and the mockup before proceeding. The mockup must reflect the corrected story before it is treated as planning-ready.

### Step 6: Save Story File

**Default behavior:** Present the story and mockup in chat for review. Wait for approval before saving to disk. The story and mockup presented here are the post-review versions — options-expert corrections are already applied.

**When asked to "save it", "write it", or "create it":** Save the story as a markdown file:

- Path: `docs/epics/02-stories/US-{N}-{story-slug}.md`
- Check existing files in that directory to find the next US-{N} number

## Story File Operations

Stories are plain markdown files saved to `docs/epics/02-stories/`. No external issue tracker.

### Naming Convention

`US-{N}-{kebab-case-story-title}.md`

Check the directory for the highest existing US-{N} to get the next number:

```bash
ls docs/epics/02-stories/
```

### Story File Format

```markdown
# US-{N}: {Story Title}

**Story:** As a {role}, I want {action} so that {outcome}.

## Context

{Why this story exists in domain terms}

## Acceptance Criteria

{Gherkin scenarios}

## Technical Notes

{Implementation guidance if relevant}

## Out of Scope

{Explicit exclusions}

## Dependencies

{Links to prerequisite stories, e.g. "Depends on US-5"}

## Estimate

{N} points
```

## Acceptance Criteria Rules

All acceptance criteria MUST use Gherkin syntax:

```gherkin
Scenario: {descriptive name}
  Given {precondition — state, not action}
  When {single user action or system event}
  Then {observable outcome — not implementation detail}
```

Key rules:

- **Given** uses past tense or present state (not actions)
- **When** describes one action (split multi-step actions into separate scenarios)
- **Then** describes what the user observes (not database operations or internal state)
- Use concrete values: `$2.50 premium` not `some premium`
- One behavior per scenario — split complex scenarios
- Every story needs at least one rejection/error scenario
- Use Scenario Outline with Examples tables for data-driven validation cases

## Operating Rules

1. **Problem first, solution second.** Understand the user need before proposing stories.
2. **Scope ruthlessly.** Each story should be implementable in one TDD cycle (Red-Green-Refactor). If it feels too big, decompose.
3. **Concrete over abstract.** Use specific dollar amounts, ticker symbols, and DTE values in acceptance criteria.
4. **Always include the negative case.** What happens with invalid input? What if the precondition isn't met?
5. **Respect the phase boundary.** Stories should belong to the current or next phase. Flag stories that depend on future-phase infrastructure.
6. **Consult the domain expert.** When uncertain about trader behavior, workflow, or edge cases, invoke `options-expert` rather than guessing.
7. **Draft by default, save on request.** Present the story and mockup for review unless explicitly told to save them.
8. **Track story numbers.** Check `docs/epics/02-stories/` to find the highest existing US-{N} before numbering a new story.
9. **Always create a mockup and review it.** After writing a user story: (a) invoke `mockup`, then (b) invoke `options-expert` to validate domain accuracy of the mockup. Apply corrections to both story and mockup before presenting results.
