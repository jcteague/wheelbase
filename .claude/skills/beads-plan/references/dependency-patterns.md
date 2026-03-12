# Cross-Feature Dependency Patterns — Wheelbase Stack

This file documents the standard dependency chains between functional areas for this project. Use these patterns when wiring cross-feature deps in Step 7 of the plan-tasks workflow.

## The Stack Dependency Chain

For most user stories, work flows bottom-up through the stack:

```
Types/Enums
    ↓
Core Engine (lifecycle / costbasis)
    ↓
Database Migration
    ↓
Service Layer
    ↓
IPC Handler
    ↓
Renderer API Client (positions.ts)
    ↓
TanStack Query Hook
    ↓
UI Component
    ↓
Page
```

Each layer's Red task depends on the layer below it completing Green.

## Standard Cross-Feature Deps to Wire

```bash
# Types must be implemented before engine tests can reference them
bd dep add <engine-red-id> <types-green-id>

# Engine must be implemented before service tests use it
bd dep add <service-red-id> <engine-green-id>

# Migration must be in place before service tests can hit the DB
bd dep add <service-red-id> <migration-green-id>

# Service must be implemented before IPC tests call it
bd dep add <ipc-red-id> <service-green-id>

# IPC handler (preload bridge) must exist before renderer hook tests can call it
bd dep add <hook-red-id> <ipc-green-id>

# Hook must be implemented before component tests can render with data
bd dep add <component-red-id> <hook-green-id>

# Component must be implemented before page tests can render it
bd dep add <page-red-id> <component-green-id>
```

## Parallel Areas (no ordering constraint)

These can be worked in any order or simultaneously — do not wire deps between them:

- **Types** and **Migration**: Types define enums; migration defines schema. Neither blocks the other.
- **Multiple core engines** (e.g., lifecycle and costbasis): Independent pure functions.
- **Multiple components** on the same page: If they share no hook, they're parallel.
- **Red-phase tasks across parallel features**: All can be written at the same time once their prerequisites are met.

## Short Stories (fewer layers)

Not every story touches all layers. Examples:

**UI-only story** (no new backend logic):
```
Renderer API Client → Hook → Component → Page
```

**Engine-only story** (pure logic, no DB or UI):
```
Types → Core Engine
```

**Service + IPC only** (no new UI):
```
Service → IPC Handler
```

Only wire deps for the layers that actually exist in the plan.

## Verifying the Graph

After wiring, `bd graph <epic-id> --json` should show:

- **Layer 0**: The first Red task(s) — foundational types, enums, or migration
- **Layer 1**: Next Red task(s) — depend on Layer 0 Green tasks
- **Same layer**: Any tasks that can run in parallel (no ordering constraint between them)

The maximum layer number equals the length of the longest dependency chain minus one.

A correctly wired graph for a full-stack story (8 areas, sequential) has 8 layers (0–7).
