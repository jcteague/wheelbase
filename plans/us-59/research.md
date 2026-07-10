# Research: US-59 — Dismiss an alert with a record of the dismissal

## Context recap

The story carries an explicit "Carryover from US-50" technical note: `upsertOpenAlert`
(`src/main/services/alerts.ts`) currently keys its "does an alert already exist"
lookup on `status = 'open'` only. If a dismissed alert's underlying condition is
still true on the next evaluation tick, `upsertOpenAlert` would find no open row
and INSERT a fresh one — silently undoing the dismissal. This is the central
unknown this research resolves: how to make the upsert dismissal-aware AND give
"condition cleared" a real signal, without adding any new I/O to the pure
`src/main/core/alerts.ts` engine (unchanged — `AlertStatus` already includes
`'dismissed'`, so no core type change is needed).

No unknowns require external research (no new libraries, no new vendor
integrations) — this is a schema + service-layer + IPC + renderer change using
patterns already established in this codebase (`pending_assignments` dismiss
flow, the US-50 upsert/resolve transaction, the US-51 read path). Findings below
are drawn from reading `src/main/services/alerts.ts`, `evaluate-alerts.ts`,
`pending-assignments.ts`, `migrations/009_create_alerts.sql`, and
`docs/spec/domain/alerts.md`.

## Architecture Decisions

### ADR: Model "condition cleared" as a dismissed→resolved transition, not a new status or column

- **Decision:** Reuse the existing `open → resolved` semantics for dismissed rows.
  On every evaluation run, after computing `keepOpenKeys` (matched ∪ skipped, same
  set `resolveAlertsNotIn` already uses), a new `clearStaleDismissals` step finds
  every row with `status = 'dismissed'` whose `(position_id, rule_code)` key is
  **absent** from `keepOpenKeys` and transitions it to `status = 'resolved'`,
  `resolved_at = now`. The `dismissed_at` timestamp already on that row is never
  cleared, so the row keeps both `dismissed_at` and `resolved_at` — a permanent
  audit record that reads "user dismissed this, and the condition later cleared."
  Once no `open` or `dismissed` row exists for a key, `upsertOpenAlert`'s existing
  lookup falls through to its normal insert path and creates a brand-new row with
  a fresh `triggered_at` the next time the rule matches — satisfying Scenario 3
  ("new alert... new triggered_at timestamp") for free, with no new code path.
- **Why:** Keeps one state machine (`open ⇄ resolved`, plus the one-way branch
  into `dismissed`) instead of inventing a second parallel "cleared" concept. It
  also reuses `resolveAlertsNotIn`'s exact `keepOpenKeys` set, so "condition
  cleared" means precisely the same thing for a dismissed alert as it already
  means for an open one — a rule that was skipped for missing data is not treated
  as cleared, matching the existing `alert-evaluation-failure-isolation` guarantee
  that a transient data gap must never silently flip state.
- **Alternatives considered:**
  - **New `dismissed_condition_cleared_at` column, row stays `dismissed` forever**
    — rejected; two parallel timestamp mechanisms for the same "did the rule stop
    matching" question, with the upsert lookup needing to branch on the column
    instead of reusing the status it already checks.
  - **In-place mutation of the dismissed row (never insert a new one on re-fire)**
    — rejected; the AC explicitly wants a fresh `triggered_at` on re-trigger, and
    the codebase already has the resolved→new-open-row pattern for exactly this
    (`docs/spec/domain/alerts.md` "Alert lifecycle" section).

### ADR: `upsertOpenAlert` gains a dismissal-aware guard; `UpsertOutcome` gets a third value

- **Decision:** `upsertOpenAlert` first checks for a row with
  `status = 'dismissed'` at the same `(position_id, rule_code)` key. If found, it
  does not insert or update — it returns a new `'suppressed'` outcome and logs
  `alert_dismissal_suppressed_reopen` at DEBUG. Otherwise behavior is unchanged
  (update the open row in place, or insert new).
- **Why:** This is the one lookup that must change to stop the carryover bug; every
  other read/write primitive (`resolveAlertsNotIn`, `listOpenAlerts`,
  `listManagementQueue`) already ignores non-open rows correctly. A partial unique
  index `idx_alerts_dismissed_unique` on `(position_id, rule_code) WHERE status =
'dismissed'` (mirroring `idx_alerts_open_unique`) guarantees at most one
  "blocking" dismissed row per key at a time, so the lookup is a simple existence
  check, not a most-recent-row query.
- **Alternatives considered:**
  - **Query "most recent row regardless of status" and branch on its status** —
    rejected; more expensive (needs `ORDER BY rowid DESC LIMIT 1` instead of an
    indexed equality lookup) and duplicates information the partial unique index
    already guarantees.

### ADR: New `AlertError` class mirrors `PendingAssignmentError`, not `ValidationError`

- **Decision:** `dismissAlert(db, alertId, now)` throws a dedicated
  `AlertError` (`code: 'NOT_FOUND' | 'NOT_OPEN'`) defined in
  `src/main/services/alerts.ts`, following the exact shape of
  `PendingAssignmentError` in `pending-assignments.ts`. `handleIpcCall`
  (`src/main/ipc/utils.ts`) gets one new `instanceof AlertError` branch, mapped
  identically to the existing `PendingAssignmentError` branch:
  `{ ok: false, code: err.code, errors: [{ field: '__root__', code: err.code,
message: err.message }] }`.
- **Why:** The story's technical note explicitly says "Reuse the existing app
  pattern for 'dismissed but retained in SQLite' established by pending
  assignments" — `PendingAssignmentError` + `dismissPending`'s not-found/wrong-state
  check is that exact pattern, already wired through `handleIpcCall`.
  `core/lifecycle.ts`'s `ValidationError` is a different pattern (field-level
  input validation with a `field` name, used for phase-transition/payload
  validation on domain objects) — not the right fit for a service-level "this row
  isn't in the state you think it's in" check.
- **Alternatives considered:**
  - **Reuse `ValidationError('__status__', 'invalid_status', ...)`** — rejected;
    would require importing a `core/` class into a service for a case that isn't
    about payload/domain validation, and loses the `NOT_FOUND` vs `NOT_OPEN`
    code distinction the AC's error message implies exists.

### ADR: No dedicated "Alert History" read path or component in this story

- **Decision:** Ship the persistence half of the audit trail (the `dismissed_at`
  column and the retained row, per the AC and the domain doc's existing "rows are
  never deleted" invariant) but do not build the mockup's separate "Alert
  History" panel/read path. The frontend work is scoped to what the Gherkin ACs
  test: the dismiss action, its inline confirm step (per the mockup's `confirm`
  state), and the alert's removal from the open queue.
- **Why:** None of the four Gherkin scenarios assert anything about a history
  _view_ — they assert DB state (`status`, `dismissed_at`) and open-queue
  membership. Building a new read path + IPC channel + component for a
  non-tested display surface would exceed this story's 3-point estimate and the
  CLAUDE.md simplicity standard ("no features beyond what was asked"). The
  mockup's `dismissed` state (empty queue message) and `confirm` state (the
  confirmation copy) are both AC-adjacent and are implemented; its "Alert
  History" panel is illustrative context for a later story, not a requirement
  here.
- **Alternatives considered:**
  - **Build the full 3-panel mockup including history** — rejected for this pass;
    flagged as a natural follow-up story if the trader wants a UI for the
    already-persisted dismissed rows.

## Open Questions

None. All technical unknowns are resolved above; no `NEEDS CLARIFICATION` markers
remain.
