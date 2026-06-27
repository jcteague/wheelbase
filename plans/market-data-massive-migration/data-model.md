# Data Model — Market-Data Migration

**No schema changes.** This migration is confined to the integration and IPC
layers. No tables, columns, indexes, or migration files were added, altered, or
removed. Market-data quotes/snapshots are read live from the provider and cached
client-side (TanStack Query); they are never persisted to SQLite.

The unrelated `ivr_snapshot` table (migration `007`) and all wheel-domain tables
are untouched by this change.
