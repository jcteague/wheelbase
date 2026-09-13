---
name: 'port-stories-to-linear'
description: 'This skill should be used when the user asks to "port stories to Linear", "move stories into Linear", "migrate the backlog", "do the next batch", "port epic N", or otherwise wants markdown user stories under docs/epics/*-stories/ turned into Linear issues. Handles one batch at a time: picks the stories, maps epic/label/estimate, transforms the body, creates the issues, and verifies them.'
---

# Port Stories to Linear

Wheelbase is mid-migration: user stories are moving from markdown files under
`docs/epics/*-stories/` into Linear, in batches. This skill runs one batch.

Read "Where User Stories Live" in `CLAUDE.md` first — it is the canonical statement of where
stories live and how they are numbered.

## Destination

| | |
| --- | --- |
| Workspace | `linear.app/optionswheel` |
| Team | **Optionswheel** (`team: "Optionswheel"`, issues get an `OPT-` prefix) |
| Epic | a Linear **project** named `Epic NN — <title>`; create it if the batch is the first from that epic |
| Title | `US-{N}: {story title}` — verbatim from the file's H1, prefix included |
| Estimate | the points from the file's `## Estimate` section, into Linear's `estimate` field |
| Label | `Feature`, `Bug`, or `Improvement` |

Tools: `list_issues`, `get_issue`, `save_issue`, `list_projects`, `save_project`.

## Step 1 — Scope the batch and check what is already there

**Never port blind.** Two failure modes to rule out before writing anything:

1. **Duplicates.** `list_issues` with `query: "US-{N}"` for every story in the batch. If an
   issue already exists, skip it or update it by passing its `id` to `save_issue` — do not
   create a second one.
2. **Stories that are already built.** Most of the remaining files describe shipped work.
   A shipped story must not land in `Backlog`, or the board will claim work is outstanding
   that is not. Check each one before deciding its state:

   ```bash
   ls -d plans/us-{N} 2>/dev/null                  # was it planned?
   ls docs/spec/features/ | grep -- "-{N}-"        # does it have a spec page?
   grep -rl "US-{N}\b" e2e/                        # does an e2e suite name it?
   ```

   A combined spec page (`us-53-54-55-…`) or a combined plan dir (`us-57-58`) counts. A bare
   mention of the story as a *dependency* in someone else's spec does not.

   Set `state` accordingly — shipped stories go straight to the team's Done state.

Confirm the batch and the intended state with the user before creating anything. Porting to
the wrong state is tedious to unpick across dozens of issues.

## Step 2 — Transform the body

The Linear `description` is the **entire file body verbatim**, with three changes:

1. **Drop the H1** (`# US-N: …`) — the issue title carries it.
2. **Drop the `## Estimate` section**, heading and points line — the `estimate` field carries
   it. Drop the `---` divider immediately above it too, or the description ends on a dangling
   horizontal rule.
3. **Insert a source line** directly after the bold user-story block at the top, followed by a
   blank line:

   ```
   Source: `docs/epics/NN-stories/US-N-slug.md`
   ```

Keep everything else byte-for-byte: Gherkin fences, tables, blockquotes, backticks, and
typographic characters (— − × ± · … – →).

Pass markdown with **real newlines and no escaping** — no `\n` sequences, no escaped quotes,
no HTML entities. The Linear MCP server's own instructions say to send content directly.

## Step 3 — Create, then verify

Create with `save_issue`. Then read back with `list_issues` using
`fields: ["id","title","project","labels","estimate","status"]` and confirm each issue's
project, label, estimate and **title prefix** are what you asked for.

## Known Linear behaviours

Learned the hard way porting the first batch. The first is data loss; the rest are cosmetic
or recoverable.

- **A markdown table indented under a bullet is corrupted on save.** Linear's parser strips
  the first character of every cell — `"LEAPS cost to date"` became `"APS cost to date"`,
  `"$22.50"` became `"2.50"`. **Fix before sending:** de-indent the table to the left margin.
  Always eyeball a nested table in the stored description.
- **A title prefix can be stripped after creation.** One issue came back without its
  `US-101: ` prefix and had to be re-set. Verify titles in Step 3 rather than trusting the
  create response.
- **Linear normalizes markdown cosmetically.** `-` bullets become `*`, `_italic_` becomes
  `*italic*`, table padding collapses, relative links get wrapped in angle brackets, two-space
  hard breaks are stripped, and bold spans that straddle a source line break are re-emitted as
  two spans. All harmless — do not "fix" these by rewriting the source files.
- **Long bodies are fine.** 20 KB descriptions round-trip intact. If a call is ever rejected,
  report the error; never silently truncate a story.

## Numbering

**Porting never renumbers.** The `US-{N}` in the file is the shared vocabulary across plans,
mockups, spec pages and e2e test names; changing it on the way into Linear breaks all of them.

Numbering only comes up when the batch surfaces a **collision** — two files claiming one
number, or a file claiming a number an epic reserved in prose. Resolve it in the repo first,
then port. Check both sources:

```bash
grep -rho "US-[0-9]*" docs/epics/ | sort -u -t- -k2 -n | tail
```

plus a Linear search. Neither alone is sufficient: epic 09 reserves US-101 through US-115 for
PMCC in its story list with no files behind them, which is how two collisions already
happened.

## Reconcile before porting, not after

Older stories describe surfaces that have since been rebuilt. US-69's criteria named a
watchlist table that US-96 replaced with cards and a detail panel; porting it unchanged would
have put stale acceptance criteria in the tracker as though they were current.

Before porting a story, check whether its surface still exists. If it does not, reconcile it
in the markdown file first — with a dated note saying what changed and why — then port the
reconciled version. Flag the reconciliation to the user; do not silently rewrite someone's
acceptance criteria.

## Scale

Batches of six or more are worth delegating: two or three stories per subagent, run in
parallel, each told exactly which files, which project, which labels and which estimates.
Full story bodies are large, and passing them through the orchestrator's context buys nothing.
Give each agent the transform rules and the known-behaviours list above, and require it to
report the issue identifier, URL, and confirmation of project/label/estimate.

## Do not

- **Delete the source markdown file after porting.** The epic documents and the spec wiki link
  to these paths. The migration's cleanup pass is a separate, deliberate decision.
- **Write a new story into `docs/epics/*-stories/`.** New stories are created directly in
  Linear by the `product-owner` skill. This skill only moves what already exists.
- **Port manual test plans.** `docs/epics/*-stories/US-N-manual-test-plan.md` files are a
  different artifact, read by the `qa-test` skill from those paths.
