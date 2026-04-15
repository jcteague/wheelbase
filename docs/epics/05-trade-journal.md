# Epic: Trade Journal and Decision Log

## Phase

Phase 1-2

## Goal

A trader can record their thesis, management decisions, and retrospective notes on every position, creating an audit trail that makes closed-position review meaningful. This is what turns raw P&L data into learning.

## Success Criteria

- Each position has a thesis field recorded at open time (why this underlying, what's the plan)
- Trader can add timestamped notes at any point during the position lifecycle
- Notes are visible on the position detail page in chronological order alongside leg events
- Trader can tag notes by type: thesis, management decision, retrospective, market observation
- Closed positions retain all notes and are searchable
- The position detail timeline interleaves legs and notes so the trader sees decisions in context

## Vertical Slice

| Layer    | What ships                                                                                   |
| -------- | -------------------------------------------------------------------------------------------- |
| Database | PositionNote model (position_id, note_type, content, created_at)                             |
| API      | POST /api/positions/:id/notes, GET /api/positions/:id/notes                                  |
| Frontend | Thesis field on new wheel form, add-note panel on position detail, interleaved timeline view |

## Stories

- [ ] US-25: Record a thesis when opening a new wheel
- [ ] US-26: Add a timestamped note to any active position
- [ ] US-27: Categorize notes by type (thesis, decision, retrospective, observation)
- [ ] US-28: Display notes interleaved with leg events on the position detail timeline
- [ ] US-29: Search and filter notes across all positions (for retrospective review)
- [ ] US-30: Edit or delete a note (with original timestamp preserved)

## Dependencies

- Epic 01: Open and Track a CSP (positions must exist)

## Strategy

Both

## Out of Scope

- Automated decision prompts or journaling suggestions (future)
- Image or file attachments on notes (future)
