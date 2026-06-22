# ADR: Fill the migration numbering gap with 007

<!-- generated:from us-44 -->

## Decision

The IVR snapshot migration is numbered `migrations/007_create_ivr_snapshot.sql`, not `008` or a later suffix.

## Why

The repo already contained `006_add_credential_settings.sql` and `008_create_pending_assignments.sql`, with no `007` file present. The custom SQLite migration runner sorts filenames lexicographically and applies any unseen file, so filling the open slot keeps the visible sequence contiguous without changing runner behavior.

Using `007` also avoids baking a stale story note into the implementation. The sequence now reads naturally in tree order: credentials/settings (`006`), IVR snapshot storage (`007`), pending assignments (`008`).

## Alternatives considered

- **Keep `008` as written in the story** — rejected because `008` was already taken in the worktree and would have forced churn in a later migration.
- **Append a new `009` migration** — rejected because the gap already existed and filling it keeps the sequence easier to audit.

## Source

- `plans/us-44/research.md`
- `migrations/007_create_ivr_snapshot.sql`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
