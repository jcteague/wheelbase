# US-504 — Add and edit notes on a position

**Epic:** Position List View
**Priority:** Should Have
**Phase:** 1 — Core Engine + Manual Trade Entry

---

## User Story

**As a** wheel trader,
**I want** to add free-text notes and a thesis to any position,
**so that** I can record my reasoning, track my plan, and review decisions after the fact.

---

## Acceptance Criteria

- From the position detail view, a notes section is editable inline or via a simple edit button
- Both `notes` (ongoing log) and `thesis` (original entry rationale) fields are supported
- Saving notes does not create a new Leg or trigger the Cost Basis Engine
- Notes are displayed in the detail view with a timestamp of last edit
- Notes support plain text; markdown rendering is a nice-to-have but not required in Phase 1
