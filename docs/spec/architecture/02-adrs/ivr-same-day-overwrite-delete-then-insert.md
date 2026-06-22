# ADR: Same-day IVR refresh uses delete-then-insert

<!-- generated:from us-44 -->

## Decision

When a fresh IVR snapshot arrives, the collector deletes any existing row for the same `underlying` on the same UTC calendar date, then inserts the new row inside one transaction.

## Why

`ivr_snapshot` uses `(underlying, observed_at)` as its primary key. A later run on the same day naturally produces a different `observed_at` timestamp, so a plain insert would create a second row instead of replacing the earlier value. The story requirement is "latest same-day value wins," and a transaction-local delete-then-insert satisfies that requirement while preserving the exact observation timestamp of the winning row.

Keeping the overwrite rule in the collector also avoids reshaping the table around a derived date column just to support one replace policy.

## Alternatives considered

- **Primary key on `(underlying, observed_date)`** — rejected because downstream consumers benefit from keeping the precise observation timestamp.
- **Synthetic upsert key or trigger** — rejected because the service-layer transaction is simpler and easier to reason about in SQLite.

## Source

- `plans/us-44/research.md`
- `plans/us-44/data-model.md`
- `src/main/services/ivr-collector.ts`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
