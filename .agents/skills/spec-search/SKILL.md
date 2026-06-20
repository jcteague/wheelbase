---
name: spec-search
description: This skill should be used when the user asks to "search the spec", "find in the wiki", "look up X in the spec", "/spec-search <query>", "where is X documented", or wants to find content in docs/spec/ without manually grepping. Ranks hits across topic, feature, and ADR pages and returns the most relevant excerpts with links.
---

# Spec Search

You search `docs/spec/` for the user's query and return ranked, excerpted results
with links. This is a thin wrapper around ripgrep with light ranking — humans
type `/spec-search foo` and want to see where "foo" is documented.

## Your input

The user's query string. Examples:

- `cost basis`
- `IPC handler positions:openCSP`
- `roll`
- `why hash routing`

If the query is missing, ask for it.

## Step 1 — Search

Use ripgrep via Bash. Strategy:

```bash
rg --type md --line-number --heading --max-count 10 --ignore-case \
   --glob 'docs/spec/**' --glob '!docs/spec/.extracts/**' \
   --glob '!docs/spec/.audits/**' \
   <query>
```

For multi-word queries, also try each word independently if the joined match
returns few hits.

## Step 2 — Rank

Prefer hits in this order:

1. **Title / `# heading`** of a page — that page is _about_ the query.
2. **`##` or `###` heading** — section is about the query.
3. **`<!-- generated -->` body** — synthesized content mentions it.
4. **Hand-written prose** — humans wrote about it.
5. **Link text only** — page just references it.

Within each tier, prefer feature pages (`features/us-*.md`) when the query looks
story-like (`us-`, "CSP entry"), and prefer topic / ADR pages otherwise.

## Step 3 — Format

Return up to 8 results. For each:

```
docs/spec/<path>:<line>
  Heading: <nearest enclosing heading>
  > <excerpt: matching line and ±1 line context>
  Open: docs/spec/<path>
```

Group by file when a file has multiple hits.

At the end, suggest:

- `/spec-search "<query> <related-term>"` if the result set is large.
- The most likely topic page if the user seems to be looking for an overview
  (e.g. `cost basis` → suggest opening `docs/spec/domain/cost-basis.md`).

## Step 4 — Empty result

If nothing matches:

1. Try fuzzy variants (`rg` with `--smart-case`, drop punctuation).
2. Suggest the closest topic page by filename Glob (e.g. user typed
   `cost-bassis` → suggest `docs/spec/domain/cost-basis.md`).
3. Tell the user the term may not be in the spec yet and suggest checking
   `plans/` directly.

## Rules

- **Don't write anything.** Search-only.
- **Don't search `.extracts/` or `.audits/`.** Those are scaffolding, not the
  user-facing wiki.
- **Don't read the whole repo.** Stay inside `docs/spec/`. If the user is
  searching for source code, suggest plain ripgrep / Grep tool instead.
- **Show file:line.** Users navigate by those.
