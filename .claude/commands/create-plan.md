---
description: Create a detailed plan from a user story

---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

1. **Setup**: Carefully read the user story file provided by user input. If no file is provided, review the stories in `docs/epics/` subdirectories. If it is unclear which user story should be used, ask the user.

2. **Understand context**: Read `CLAUDE.md` and relevant existing source files to understand what is already implemented. Identify gaps between the current codebase and what the story requires.

3. **Execute plan workflow**: Follow the Phase 0, Phase 1, and Phase 2 workflow below to:
   - Phase 0: Generate `research.md` (resolve all unknowns)
   - Phase 1: Generate `data-model.md`, `contracts/`, `quickstart.md`
   - Phase 2: Generate `plan.md` (ordered TDD implementation plan)

4. **Stop and report**: Command ends after Phase 2. Report the output directory and all generated artifacts.

## Output Directory

Write all artifacts to `plans/{story-id}/` where `{story-id}` is derived from the story filename (e.g., story `US-2-list-positions.md` → `plans/us-2/`). Use absolute paths for all file writes.

## Phases

### Phase 0: Outline & Research

1. Review the **Implementation Notes** of the user story and any other section related to technical implementation.

2. For any technical element not already covered by the existing codebase or tech stack, identify it as an unknown requiring research.

3. **Dispatch research agents** for each unknown. Use the Agent tool to research unknowns in parallel when queries are independent. Example tasks:
   - "Research {unknown} for {feature context} in a FastAPI + SQLAlchemy 2 project"
   - "Find best practices for {tech} in {domain}"

4. **Consolidate findings** in `plans/{story-id}/research.md` using this format:

   ```markdown
   ## {Topic}
   - **Decision:** [what was chosen]
   - **Rationale:** [why chosen]
   - **Alternatives considered:** [what else was evaluated]
   ```

   Any open question that cannot be resolved through research should be flagged with `<!-- NEEDS CLARIFICATION: {question} -->` and surfaced to the user before proceeding to Phase 1.

**Output**: `plans/{story-id}/research.md` with all unknowns resolved or flagged.

**Gate**: Do not proceed to Phase 1 if any `NEEDS CLARIFICATION` items remain unresolved.

---

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete with no unresolved `NEEDS CLARIFICATION` items.

1. **Extract entities from the story** → `plans/{story-id}/data-model.md`:
   - Entity name, fields, types, and relationships
   - Validation rules from acceptance criteria
   - State transitions if applicable

2. **Define interface contracts** → `plans/{story-id}/contracts/`:
   - Document the API endpoints, request/response shapes, and error formats the story requires
   - Use the existing schema patterns in `backend/app/api/schemas.py` as the reference format
   - Skip if the story has no new API surface (pure frontend or pure engine work)

3. **Write a quickstart** → `plans/{story-id}/quickstart.md`:
   - Step-by-step instructions to run the tests for this story locally
   - Any migrations, seed data, or environment setup required
   - Expected test command and passing criteria

**Output**: `plans/{story-id}/data-model.md`, `plans/{story-id}/contracts/`, `plans/{story-id}/quickstart.md`

---

### Phase 2: Implementation Plan

**Prerequisites:** Phase 1 complete.

Write `plans/{story-id}/plan.md` — the primary artifact that `/plan-tasks` will consume to generate the TDD task list. This file must be specific enough that `plan-tasks` can derive concrete Red/Green/Refactor task descriptions directly from it.

#### Structure of `plan.md`

```markdown
# Implementation Plan: {Story ID} — {Story Title}

## Summary

[2–3 sentences: what is being built, what it connects to, and what the done state looks like.]

## Supporting Documents

Read these before starting implementation — they contain the decisions, data model, and API contract:

- **User Story & Acceptance Criteria:** `docs/epics/01-stories/{story-file}.md`
- **Research & Design Decisions:** `plans/{story-id}/research.md`
- **Data Model & Selection Logic:** `plans/{story-id}/data-model.md`
- **API Contract(s):** `plans/{story-id}/contracts/{endpoint}.md`
- **Quickstart & Verification:** `plans/{story-id}/quickstart.md`

[Omit any entry that was not generated for this story — e.g. skip contracts/ for pure-engine or pure-frontend work.]

## Prerequisites

[List anything already done (existing models, migrations, dependencies) that this story builds on. If nothing, write "None — all required schema and infrastructure already exists."]

## Implementation Areas

[List work areas in strict dependency order — foundational work (schemas, models, core logic) before higher-level work (routes, frontend). Each area maps to one Red → Green → Refactor cycle in /plan-tasks.]

### {N}. {Area Name}

**Files to create or modify:**
- `path/to/file.py` — [what changes]

**Red — tests to write:**
- [Specific test case: what scenario, what assertion, what file it goes in]
- [Each bullet is one distinct test case or test group]

**Green — implementation:**
- [Specific thing to build: class, function, endpoint handler, component, etc.]
- [Reference the exact schema fields, logic rules, or API shape from data-model.md / contracts/ — name the file, not just "the spec"]

**Refactor — cleanup to consider:**
- [Naming, duplication, structure concerns to check after Green passes]
- [If nothing is expected, write "Check for duplication and naming consistency."]

**Acceptance criteria covered:**
- [Quote or paraphrase the Gherkin scenario(s) this area satisfies]
```

#### Rules for `plan.md`

- Order areas strictly by dependency — never reference a file or symbol before the area that creates it
- Red bullets must be specific enough to write actual test functions from (name the test file, the case, the assertion)
- Green bullets must name the exact file and construct to build (e.g. "`PositionListItemResponse` Pydantic model in `backend/app/api/schemas.py`"), not vague nouns
- Every acceptance criterion from the user story must be covered by at least one area
- Do not describe TDD phases abstractly — write what the tests check and what the code does

**Output**: `plans/{story-id}/plan.md`

---

## Key Rules

- Use absolute paths for all file writes
- Stop and ask the user if any `NEEDS CLARIFICATION` items cannot be resolved
- Do not begin Phase 1 until Phase 0 is complete
- Do not implement any code — this command produces planning artifacts only
