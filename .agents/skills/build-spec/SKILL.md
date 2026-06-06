---
name: build-spec
description: This skill should be used when the user asks to "build the spec", "build initial spec", "generate the wiki", "create docs/spec", "build the source of truth document", "summarize all the plans into a wiki", or wants to perform the one-time initial build of the wheelbase spec/wiki. Performs full extraction across all plan dirs and synthesizes the topic + feature pages under docs/spec/.
---

# Build Spec — Initial Wiki Generation

You orchestrate the **one-time initial build** of the wheelbase spec wiki at
`docs/spec/`. Subsequent refreshes are incremental and use `/update-spec`.

Two-stage pipeline: **extract** (per plan dir, parallel) then **synthesize** (per
topic, parallel).

## Stage 0 — Confirm scope

Before starting, list every plan dir under `plans/`. There are ~38. Confirm with
the user that the spec should cover **all of them**, or scope to a subset (e.g.
only stories with `refactor-results.md` indicating completion).

Also confirm the topic structure. Default topic list:

- `architecture/01-overview.md`
- `architecture/02-adrs/` — one file per architecture decision, indexed in
  `architecture/02-adrs/README.md`
- `domain/wheel-lifecycle.md`
- `domain/cost-basis.md`
- `domain/alerts.md`
- `domain/market-data.md`
- `contracts/ipc-handlers.md`
- `contracts/alpaca-integration.md`
- `contracts/zod-schemas.md`
- `schema/tables.md`
- `schema/migrations.md`
- `features/us-N-<slug>.md` — one per plan
- `glossary.md`
- `README.md` — index

If unclear which topics a given codebase calls for, scan a sample of plan dirs to
discover domain language before deciding.

## Stage 1 — Extract (parallel)

For each plan dir, launch a `plan-extractor` subagent. Run **up to 6 in parallel
per batch** to keep things responsive but avoid overwhelming the conversation.

Prompt per launch:

```
Extract plans/<plan-name> into docs/spec/.extracts/<plan-name>.md.
Follow your subagent instructions exactly. Return the one-line summary.
```

After each batch, briefly note which extracts completed before launching the next.

## Stage 2 — Build the extract manifest

After all extractions complete, scan `docs/spec/.extracts/*.md` and build a
mental manifest: for each topic, which extracts feed it. Rough heuristics:

- **Architecture ADRs** — every plan can contribute; one ADR file per distinct
  decision. Deduplicate decisions by title.
- **Domain pages** — match by keyword: cost basis plans → `cost-basis.md`,
  lifecycle/phase plans → `wheel-lifecycle.md`, alerts → `alerts.md`, market
  data/quotes/Alpaca polling → `market-data.md`.
- **Contracts** — every plan with `contracts/` content → `ipc-handlers.md` or
  `alpaca-integration.md` depending on type.
- **Schema** — every plan with schema changes → `tables.md`; every plan that
  added a migration → `migrations.md`.
- **Features** — group plans by **story stem** before synthesis:
  - Parent: `plans/us-N/` → `features/us-N-<slug>.md`.
  - Children: `plans/us-N-<suffix>/` (e.g. `us-12-refactor`, `us-8-pct-fix`)
    are **revisions** of the parent. They roll into the parent's feature page;
    they do NOT get their own page.
  - Grouping rule: any plan dir matching `us-N` and `us-N-*` (same numeric
    stem) is one group. The parent extract goes first; revisions follow in
    directory-mtime order (older first).
  - Bare-name plans (e.g. `extract-sheet-primitives`, `design-system`,
    `frontend-perf-reuse`) have no parent feature; they become their own
    feature page named after the dir (e.g. `features/extract-sheet-primitives.md`).
    Skinny one-off plans (bare `.md` files in plans/) — stop and ask the user
    where they should go.

If a plan doesn't fit cleanly into any topic, log it and ask the user where it
belongs. Don't silently drop it.

## Stage 3 — Synthesize (parallel)

For each topic page, launch a `spec-section-writer` subagent with:

```
Target page: docs/spec/<path>
Topic: <topic-name>
Extracts: <comma-separated list of .extracts/*.md files>
Follow your subagent instructions exactly.
```

Run up to 6 in parallel.

For **feature pages**, pass the parent + all revision extracts as one comma list
(parent first) so the writer can synthesize a single page with a Revisions
section. Example for `us-12`:

```
Target page: docs/spec/features/us-12-roll-csp.md
Topic: features
Extracts: docs/spec/.extracts/us-12.md, docs/spec/.extracts/us-12-refactor.md
```

The slug after `us-N-` in the page filename comes from the parent extract's
title (kebab-cased, 2–4 words).

## Stage 4 — Write the index

After all topic pages exist, write `docs/spec/README.md` as the wiki index. It
should:

- Explain what this directory is and how it's maintained (link to the
  generated-block convention).
- List every topic page with a one-line description.
- List every feature page grouped by epic.
- Link to `/update-spec` and `/audit-spec` for maintenance.

This file is fully generated — wrap its body in `<!-- generated -->` markers
referencing all plans.

## Stage 5 — Final report

Print a summary table:

```
Extracted:    38 plans
Generated:    13 topic pages, 38 feature pages
Skipped:      <list>
Unfit plans:  <list, asked the user about>
```

## Rules

- **No source-code reading during synthesis.** Source code is verified later by
  `/audit-spec`.
- **Don't write to docs/spec/.extracts/** yourself — only subagents do.
- **Preserve human edits.** This is the first build, but the subagents already
  honor `<!-- generated -->` markers, so re-runs are safe.
- **One extract per plan dir, exactly.** If two plan dirs cover the same story
  (e.g. `us-12` and `us-12-refactor`), produce two extracts and let the
  synthesizer dedupe.
- **No code changes outside docs/spec/.**
- **Stop and ask** if you hit a plan dir that's empty, malformed, or has no
  recognizable structure.
