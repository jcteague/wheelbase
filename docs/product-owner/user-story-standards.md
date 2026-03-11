# User Story Standards Reference

Detailed guidance on story format, acceptance criteria in Gherkin syntax, and patterns for decomposing features into well-scoped stories. Load this file when writing, reviewing, or refining user stories.

---

## User Story Format

### Title

Short, action-oriented, prefixed with the story ID:

```
US-{N}: {verb} {object} {context}
```

Examples:
- US-12: Roll an open CSP to a later expiration
- US-25: View portfolio-level premium income summary
- US-31: Receive alert when position reaches 50% profit target

### Body

```markdown
**As a** {persona or role},
**I want to** {goal or action},
**So that** {business value or motivation}.
```

Rules:
- The persona should be specific. Prefer "wheel trader managing 5+ active positions" over "user."
- The goal describes the problem at a high level, not the UI solution.
- The "so that" clause must state a real benefit. If the benefit is unclear, the story may not be valuable.

### Story Sections

Every story issue should contain these sections in order:

1. **User Story** — the As a / I want / So that block
2. **Context** — 2-4 sentences explaining why this matters, referencing the wheel/PMCC lifecycle phase it belongs to
3. **Acceptance Criteria** — Gherkin scenarios (see below)
4. **Technical Notes** — optional implementation hints, affected files, API endpoints, or data model changes
5. **Out of Scope** — what this story explicitly does NOT cover (prevents scope creep)
6. **Dependencies** — other stories that must be complete first

---

## Gherkin / Given-When-Then Syntax

### Format

```gherkin
Scenario: {descriptive name}
  Given {precondition or initial state}
  And {additional precondition if needed}
  When {action the user takes}
  And {additional action if needed}
  Then {expected observable outcome}
  And {additional outcome if needed}
```

### Writing Rules

1. **Given** establishes state, not actions. Use past tense or present state:
   - Good: `Given the trader has an open CSP on AAPL at the $180 strike`
   - Bad: `Given the trader opens a CSP` (this is an action, not a state)

2. **When** describes a single user action or system event:
   - Good: `When the trader submits the roll form`
   - Bad: `When the trader fills in the form and clicks submit and confirms` (too many steps)

3. **Then** describes observable outcomes, not implementation:
   - Good: `Then the position card shows the updated cost basis`
   - Bad: `Then the database updates the cost_basis_snapshot table` (implementation detail)

4. **Use concrete values** in examples, not vague descriptions:
   - Good: `Given the CSP premium was $2.50 per contract`
   - Bad: `Given some premium was collected`

5. **One behavior per scenario.** If a scenario has more than 5-6 lines, split it.

6. **Name scenarios descriptively.** The name should read like a test case title:
   - Good: `Scenario: Cost basis updates after CSP assignment`
   - Bad: `Scenario: Test 1`

### Scenario Outline for Data-Driven Cases

When the same behavior applies to multiple inputs:

```gherkin
Scenario Outline: Reject CSP with invalid inputs
  Given the trader is on the new wheel form
  When the trader enters <field> as "<value>"
  And submits the form
  Then a validation error appears: "<message>"

  Examples:
    | field              | value      | message                          |
    | strike             | 0          | Strike must be greater than zero |
    | premium_per_contract | -1.00    | Premium must be positive         |
    | contracts          | 0          | At least one contract required   |
```

### Background for Shared Preconditions

When multiple scenarios in the same story share setup:

```gherkin
Background:
  Given the trader has an active wheel on AAPL
  And the current phase is CC_OPEN
  And the CC strike is $185 expiring in 14 days

Scenario: Successful roll up and out
  When the trader rolls the CC to $190 strike, 45 DTE
  Then ...

Scenario: Roll rejected when net debit exceeds threshold
  When the trader rolls the CC to $195 strike, 45 DTE with a net debit of $3.50
  Then ...
```

---

## Acceptance Criteria Patterns for Wheelbase

### CRUD Operations

```gherkin
Scenario: Successfully create {entity}
  Given {valid preconditions}
  When the trader submits {the creation form/request}
  Then {entity} appears in the {list/dashboard}
  And {entity} has status {expected status}
  And the audit trail records the creation event

Scenario: Reject creation with invalid data
  Given {the form is open}
  When the trader enters {invalid field}: "{bad value}"
  Then a validation error appears: "{specific message}"
  And no {entity} is created
```

### Lifecycle Transitions

```gherkin
Scenario: Transition from {phase A} to {phase B}
  Given the position is in phase {A}
  And {preconditions for transition}
  When {trigger event}
  Then the position phase changes to {B}
  And the cost basis recalculates to {expected value}
  And a {notification/queue item} appears

Scenario: Reject invalid transition from {phase A} to {phase C}
  Given the position is in phase {A}
  When {invalid trigger}
  Then the transition is rejected with message "{reason}"
  And the position remains in phase {A}
```

### Alerts and Notifications

```gherkin
Scenario: Alert fires when {condition}
  Given the position has {state}
  And the {metric} is {value that triggers the rule}
  When the alert engine evaluates active positions
  Then a {urgency} alert appears in the management queue
  And the alert message includes: {key data points}

Scenario: Alert suppressed when {condition not met}
  Given the position has {state}
  And the {metric} is {value below threshold}
  When the alert engine evaluates active positions
  Then no alert is created for this position
```

### Cost Basis Calculations

```gherkin
Scenario: Cost basis after {event}
  Given the effective cost basis is ${X} per share
  And {event details with specific dollar amounts}
  When the {event} is recorded
  Then the effective cost basis updates to ${expected} per share
  And the total premium collected updates to ${expected}
```

---

## Story Sizing Guidelines

### Small (1-2 points)
- Single form or display change
- One API endpoint
- Pure validation logic
- Example: "Add DTE countdown to position card"

### Medium (3-5 points)
- Full CRUD for an entity
- Lifecycle transition with cost basis update
- New alert rule with configuration
- Example: "Roll an open CSP with net credit/debit tracking"

### Large (8 points)
- Multi-step workflow spanning frontend and backend
- New engine or major engine extension
- Example: "PMCC entry flow with dual chain selector and safety validation"

### Too Large (13+ points — decompose)
- Spans multiple phases or modules
- Has more than 8 acceptance criteria scenarios
- Contains the word "and" connecting two distinct features in the title
- Example: "Build the screener and integrate with trade entry" should be split

---

## Epic Structure

An epic groups related stories that together deliver a coherent capability. For Wheelbase, epics typically align with feature specification modules or build phases.

### Epic Description Template

```markdown
## {Epic Title}

### Goal
{1-2 sentences: what user capability does this epic deliver?}

### Success Criteria
{How do we know this epic is complete? Observable outcomes.}

### Stories
- [ ] US-{N}: {title}
- [ ] US-{N}: {title}
- ...

### Phase
{Which build phase does this epic belong to?}

### Dependencies
{Other epics or external dependencies}
```

### Decomposition Heuristic

Start with the feature spec module. For each module:
1. Identify the distinct user-facing capabilities
2. For each capability, identify the happy path story
3. Then add stories for: validation/error cases, edge cases, configuration, and display/reporting
4. Order stories so each builds on the last (the dependency chain)

---

## Common Anti-Patterns to Avoid

### Vague Acceptance Criteria
- Bad: "The user can see their positions"
- Good: Specific Gherkin scenario with concrete data

### Implementation Stories
- Bad: "Create the positions database table"
- Good: "Open a new wheel by selling a CSP" (the table is an implementation detail)

### Missing Negative Cases
- Every story should have at least one "rejection" or "error" scenario
- What happens with invalid input? Insufficient capital? Duplicate entry?

### Scope Creep in Acceptance Criteria
- If a scenario introduces a feature not in the story title, it belongs in a separate story
- Use "Out of Scope" section to explicitly capture these for later

### Stories Without Business Value
- If the "So that" clause is hard to write, the story may be a task, not a story
- Tasks (migrations, refactors, infrastructure) are tracked separately, not as user stories
