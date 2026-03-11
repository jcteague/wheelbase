# GitHub Workflow Reference

Procedures for managing epics and stories using GitHub Projects and Issues via the `gh` CLI. Load this file when creating, updating, or organizing work items.

---

## Repository

- Owner: `jcteague`
- Repo: `wheelbase`

All `gh` commands run against this repo by default from the working directory.

---

## Project Setup

### One-Time Project Creation

To create the project board (run once, then store the project number):

```bash
gh project create --owner jcteague --title "Wheelbase" --format json
```

Capture the project number from the output. Store it for later commands.

### Custom Fields

Create fields to track story metadata on the project board:

```bash
# Phase field (single-select)
gh project field-create {PROJECT_NUMBER} --owner jcteague \
  --name "Phase" --data-type "SINGLE_SELECT" \
  --single-select-options "Phase 1,Phase 2,Phase 3,Phase 4,Phase 5"

# Story Points field (number)
gh project field-create {PROJECT_NUMBER} --owner jcteague \
  --name "Points" --data-type "NUMBER"

# Type field (single-select)
gh project field-create {PROJECT_NUMBER} --owner jcteague \
  --name "Type" --data-type "SINGLE_SELECT" \
  --single-select-options "Epic,Story,Task,Bug"
```

---

## Labels

### Required Labels (Create Once)

```bash
# Story type labels
gh label create "epic" --description "Epic grouping related stories" --color "7B68EE"
gh label create "story" --description "User story" --color "0E8A16"
gh label create "task" --description "Technical task (not user-facing)" --color "D4C5F9"

# Phase labels
gh label create "phase:1" --description "Phase 1: Core engines + manual entry" --color "FBCA04"
gh label create "phase:2" --description "Phase 2: Alpaca read + live dashboard" --color "F9D0C4"
gh label create "phase:3" --description "Phase 3: Alerts + screener" --color "C2E0C6"
gh label create "phase:4" --description "Phase 4: Order execution + PMCC" --color "BFD4F2"
gh label create "phase:5" --description "Phase 5: Analytics" --color "D4C5F9"

# Priority labels
gh label create "priority:high" --description "Must have for current phase" --color "B60205"
gh label create "priority:medium" --description "Should have for current phase" --color "D93F0B"
gh label create "priority:low" --description "Nice to have" --color "FBCA04"

# Strategy labels
gh label create "strategy:wheel" --description "Classic wheel strategy" --color "1D76DB"
gh label create "strategy:pmcc" --description "PMCC strategy" --color "5319E7"
gh label create "strategy:both" --description "Applies to both strategies" --color "006B75"
```

---

## Creating Epics

Epics are GitHub Issues with the `epic` label. Child stories reference the epic in their body.

```bash
gh issue create \
  --title "Epic: {title}" \
  --label "epic,phase:{N}" \
  --body "$(cat <<'EOF'
## Goal

{1-2 sentences: what capability does this epic deliver?}

## Success Criteria

- {Observable outcome 1}
- {Observable outcome 2}

## Stories

- [ ] #{story_issue_number}: {story title}
- [ ] #{story_issue_number}: {story title}

## Phase

Phase {N}: {phase description}
EOF
)"
```

After creating child stories, update the epic body with their issue numbers using `gh issue edit`.

---

## Creating Stories

### Story Issue Template

```bash
gh issue create \
  --title "US-{N}: {title}" \
  --label "story,phase:{N},{strategy_label},{priority_label}" \
  --body "$(cat <<'EOF'
## User Story

**As a** {persona},
**I want to** {goal},
**So that** {value}.

## Context

{2-4 sentences on why this matters and which lifecycle phase it belongs to.}

## Acceptance Criteria

```gherkin
Scenario: {happy path}
  Given {precondition}
  When {action}
  Then {outcome}

Scenario: {error/edge case}
  Given {precondition}
  When {invalid action}
  Then {rejection outcome}
```

## Technical Notes

- {Implementation hints, affected files, API endpoints}

## Out of Scope

- {Explicitly excluded items}

## Dependencies

- #{issue_number}: {dependency title}

**Epic:** #{epic_issue_number}
**Points:** {estimate}
EOF
)"
```

### Adding Story to Project Board

After creating the issue:

```bash
# Add to project
gh project item-add {PROJECT_NUMBER} --owner jcteague --url {ISSUE_URL}

# Set custom fields (requires item ID from the add command)
gh project item-edit --project-id {PROJECT_ID} --id {ITEM_ID} \
  --field-id {PHASE_FIELD_ID} --single-select-option-id {OPTION_ID}

gh project item-edit --project-id {PROJECT_ID} --id {ITEM_ID} \
  --field-id {POINTS_FIELD_ID} --number {POINTS}

gh project item-edit --project-id {PROJECT_ID} --id {ITEM_ID} \
  --field-id {TYPE_FIELD_ID} --single-select-option-id {STORY_OPTION_ID}
```

---

## Querying and Listing

### List Stories by Phase

```bash
gh issue list --label "story,phase:1" --state open
```

### List Stories in an Epic

```bash
gh issue list --label "story" --search "Epic: #{epic_number} in:body"
```

### View Project Board

```bash
gh project item-list {PROJECT_NUMBER} --owner jcteague --format json
```

### Check Story Status

```bash
gh issue view {ISSUE_NUMBER}
```

---

## Updating Stories

### Close a Completed Story

```bash
gh issue close {ISSUE_NUMBER} --reason completed
```

### Add a Comment (e.g., implementation notes)

```bash
gh issue comment {ISSUE_NUMBER} --body "Implementation complete. See PR #{pr_number}."
```

### Update Epic Checklist

After completing a child story, edit the epic to check it off:

```bash
gh issue edit {EPIC_NUMBER} --body "{updated body with checked item}"
```

---

## Workflow States

Use project board status columns to track progress:

| Status | Meaning |
|---|---|
| Backlog | Story written but not started |
| Ready | Story refined, dependencies met, ready to implement |
| In Progress | Currently being built (TDD: Red/Green/Refactor cycle) |
| Review | Implementation complete, awaiting review |
| Done | Merged, tests pass, acceptance criteria verified |

---

## Batch Operations

### Create Multiple Stories from a List

When the product owner generates a batch of stories, create them sequentially and capture issue numbers for the epic checklist:

```bash
# Pattern for batch creation (execute per story)
ISSUE_URL=$(gh issue create \
  --title "US-{N}: {title}" \
  --label "story,phase:{N}" \
  --body "{body}" \
  --json url --jq '.url')
echo "Created: $ISSUE_URL"
```

### Bulk Label Update

```bash
gh issue edit {NUMBER} --add-label "priority:high"
gh issue edit {NUMBER} --remove-label "priority:low"
```

---

## Conventions

1. **Story numbering:** US-{N} where N is a sequential number maintained across the project. Check the highest existing story number before assigning new ones.
2. **Epic prefix:** Always prefix epic titles with "Epic:" for easy filtering.
3. **Cross-references:** Always link stories to their parent epic with `**Epic:** #{number}` at the bottom of the story body.
4. **Branch naming:** When implementing, branch names follow `us-{N}/{short-description}` (e.g., `us-12/roll-csp`).
5. **PR linking:** PRs should reference the story with `Closes #{issue_number}` to auto-close on merge.
