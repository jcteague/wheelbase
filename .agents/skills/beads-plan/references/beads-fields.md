# Beads Field Reference — Wheelbase Plans

Worked examples of plan content → beads field mapping for this project's plan format.

## Epic

```bash
bd create --type=epic \
  --title="US-3 — List Open Positions" \
  --description="Read-only view of all active wheel positions from the SQLite database, surfaced via IPC to the renderer. Establishes the list-positions service, IPC handler, TanStack Query hook, and positions list page." \
  --labels="us-3" \
  --priority=2 \
  --silent
```

## Feature (functional area)

```bash
bd create --type=feature \
  --title="list-positions service" \
  --parent=$EPIC_ID \
  --description="Pure database read — queries all positions with their latest phase and cost basis snapshot. Returns typed result objects consumed by the IPC handler." \
  --design="Uses better-sqlite3 synchronous API. No ORM — raw SQL with explicit column selection. selectinload equivalent done via two queries and join in TypeScript to keep core pure." \
  --spec-id="plans/us-3/plan.md" \
  --labels="us-3,service" \
  --priority=2 \
  --silent
```

## Red Task

```bash
bd create --type=task \
  --title="[Red] Write failing tests for list-positions service" \
  --parent=$FEATURE_ID \
  --description="Use the /red skill.

Test file: src/main/services/list-positions.test.ts

Test cases:
- listPositions() with empty DB → returns []
- listPositions() with two positions → returns both, sorted by created_at DESC
- Each result has: id, ticker, phase (WheelPhase), costBasis (string, 4dp), createdAt (ISO string)
- Closed positions are excluded (status !== 'closed')

Run pnpm test src/main/services/list-positions.test.ts and confirm all fail." \
  --acceptance="All new tests failing. Run: pnpm test src/main/services/list-positions.test.ts" \
  --spec-id="plans/us-3/plan.md" \
  --labels="red,us-3,service" \
  --priority=2 \
  --silent
```

## Green Task

```bash
bd create --type=task \
  --title="[Green] Implement list-positions service" \
  --parent=$FEATURE_ID \
  --description="Use the /green skill.

Implementation file: src/main/services/list-positions.ts
Paired test file: src/main/services/list-positions.test.ts (make these pass)

Key implementation details:
- Export: listPositions(db: Database): PositionSummary[]
- SQL: SELECT id, ticker, phase, cost_basis, created_at FROM positions WHERE status != 'closed' ORDER BY created_at DESC
- Map cost_basis TEXT column → string (no Decimal conversion — keep as stored)
- Map created_at INTEGER (Unix ms) → ISO string via new Date(n).toISOString()
- Type PositionSummary: { id: string; ticker: string; phase: WheelPhase; costBasis: string; createdAt: string }

No extra logic beyond what tests require." \
  --acceptance="pnpm test src/main/services/list-positions.test.ts passes. pnpm typecheck and pnpm lint clean." \
  --design="Service is a pure function (takes db, returns data). No class, no singleton. Side-effect boundary is at the IPC handler, not here. Keeps core testable without Electron." \
  --spec-id="plans/us-3/plan.md" \
  --labels="green,us-3,service" \
  --priority=2 \
  --silent
```

## Refactor Task

```bash
bd create --type=task \
  --title="[Refactor] Clean up list-positions service" \
  --parent=$FEATURE_ID \
  --description="Use the /refactor skill.

Files to review:
- src/main/services/list-positions.ts
- src/main/services/list-positions.test.ts

Look for:
- SQL query clarity (aliases, formatting)
- Type naming consistency with rest of services/
- Test fixture duplication — extract shared setup if repeated
- Function length (>20 lines → extract)
- No logging needed here (pure function)

Behaviour must not change. Tests must stay green throughout." \
  --acceptance="pnpm test still passes. pnpm lint and pnpm typecheck clean." \
  --spec-id="plans/us-3/plan.md" \
  --labels="refactor,us-3,service" \
  --priority=3 \
  --silent
```

## Cross-Feature Dependency Examples

```bash
# IPC handler Red depends on service Green (service must exist to write tests against it)
bd dep add $IPC_RED_ID $SERVICE_GREEN_ID

# Renderer hook Red depends on IPC handler Green (preload bridge must exist)
bd dep add $HOOK_RED_ID $IPC_GREEN_ID

# UI component Red depends on hook Green (hook must exist to render against)
bd dep add $COMPONENT_RED_ID $HOOK_GREEN_ID
```

## Labels Convention

| Label       | When used                                      |
| ----------- | ---------------------------------------------- |
| `red`       | Red (failing test) tasks                       |
| `green`     | Green (implementation) tasks                   |
| `refactor`  | Refactor (cleanup) tasks                       |
| `us-N`      | Story identifier                               |
| `service`   | Service layer tasks                            |
| `ipc`       | IPC handler tasks                              |
| `renderer`  | Renderer-side tasks (hooks, components, pages) |
| `migration` | Database migration tasks                       |
| `core`      | Core engine tasks (lifecycle, costbasis)       |
