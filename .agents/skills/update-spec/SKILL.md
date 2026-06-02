---
name: update-spec
description: This skill should be used when the user asks to "update the spec", "refresh spec for us-N", "regenerate spec for story X", "spec just landed for us-N", "/update-spec us-N", or wants to incrementally refresh the docs/spec/ wiki after a single plan/story has completed. Re-extracts one plan dir and updates only the topic pages that reference it.
---

# Update Spec — Incremental Refresh

You incrementally refresh the wheelbase spec wiki for **one completed plan**.
For the initial full build, use `/build-spec`.

## Your input

The story / plan name. Examples: `us-32`, `us-12-refactor`, `extract-sheet-primitives`.

If the user runs `/update-spec` with no argument, ask which plan to refresh. If
they pass a name that doesn't match a `plans/<name>/` directory, list near matches
with Glob and ask which they meant.

## Step 1 — Detect siblings, then re-extract

A feature page is owned by the **parent** plan (`us-N`). If the input is a
child plan (e.g. `us-12-refactor`, `us-8-pct-fix`), its feature page is shared
with the parent and any other revisions.

Detect siblings:

1. Determine the story stem. For input `us-N-<suffix>`, stem is `us-N`. For
   input `us-N`, stem is `us-N`. For non-`us-` names (e.g.
   `extract-sheet-primitives`), no siblings — treat as standalone.
2. Glob `plans/us-N*` (using the stem) to find all related plan dirs.
3. Ensure an extract exists at `docs/spec/.extracts/<plan-name>.md` for each
   sibling. If missing, launch a `plan-extractor` for it.

Then launch a `plan-extractor` for the input plan to refresh its own extract
(overwriting `docs/spec/.extracts/<plan-name>.md`).

## Step 2 — Diff the extract  

Compare the new extract to the previous one (if it exists). Identify which
sections changed:

- New ADRs added → affects architecture topics + an ADR file
- New contracts → affects `contracts/ipc-handlers.md` (or alpaca-integration, etc.)
- Schema changes → affects `schema/tables.md` and/or `schema/migrations.md`
- New AC / what-was-built → affects the feature page `features/us-N-*.md`

If no diff (the extract is unchanged), report "no changes" and stop.

## Step 3 — Identify affected pages

Build the list of topic pages to refresh:

1. **Always refresh** the feature page: `features/<plan-name>.md` (create if missing).
2. **Grep `docs/spec/`** for pages whose `<!-- generated:from -->` markers include
   this plan name. Those pages already know they're driven by this plan — refresh
   them.
3. **For genuinely new content** that no existing page covers (e.g. a new domain
   area), ask the user where it should go. Don't invent a new top-level page
   silently.

## Step 4 — Synthesize affected pages

For each affected page, launch a `spec-section-writer` subagent:

```
Target page: docs/spec/<path>
Topic: <topic-name>
Extracts: <comma-separated list of .extracts/*.md the page is driven by>
Follow your subagent instructions exactly.
```

Important: pass **all** extracts that drive the page, not just the newly-changed
one. The writer regenerates the whole `<!-- generated -->` block from the union
of inputs.

For the **feature page**, that means passing the parent extract plus every
revision extract in chronological order (parent first). Example for an update
to `us-12-refactor`:

```
Target page: docs/spec/features/us-12-roll-csp.md
Topic: features
Extracts: docs/spec/.extracts/us-12.md, docs/spec/.extracts/us-12-refactor.md
```

Run in parallel where possible (3–4 at a time).

## Step 5 — Update the index

If you created any new files (typically: a new ADR file or a new feature page),
update `docs/spec/README.md` so its index includes them. Use `spec-section-writer`
with `Target page: docs/spec/README.md` and the full list of all extracts.

## Step 6 — Report

Print:

```
Updated spec for <plan-name>:
  Extract: refreshed (N sections changed | unchanged)
  Pages updated: <list>
  Pages created: <list>
```

Optionally remind the user to run `/audit-spec` if many pages changed.

## Rules

- **Single plan in scope.** Don't refresh other plans' content. The whole point
  of incremental is to be cheap.
- **Don't run extraction on unrelated plans.** Touching `docs/spec/.extracts/`
  for any plan other than the input is forbidden.
- **Preserve human edits.** Subagents already respect `<!-- generated -->`
  markers; trust them.
- **Ask before creating new top-level topics.** Adding e.g. `docs/spec/security/`
  on your own is too big a decision.
