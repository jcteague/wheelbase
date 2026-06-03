---
name: audit-spec
description: This skill should be used when the user asks to "audit the spec", "check spec drift", "verify spec matches code", "find stale spec pages", "/audit-spec", or wants to know which docs/spec/ pages have drifted from the current src/ code. Runs the spec-auditor subagent across every spec page and aggregates drift findings.
---

# Audit Spec — Drift Detection

You verify that `docs/spec/` matches current source code reality. Findings only —
this skill **does not** fix drift, just reports it.

## Step 1 — Collect pages

Glob `docs/spec/**/*.md` excluding:

- `docs/spec/.extracts/**` (those are inputs, not the spec)
- `docs/spec/.audits/**` (the auditor's own output)
- `docs/spec/README.md` (index, mostly cross-links — low audit value)

If the user passes a specific page or directory as an argument, scope to that.

## Step 2 — Audit in parallel

For each spec page, launch a `spec-auditor` subagent:

```
Audit docs/spec/<path>. Write the report to docs/spec/.audits/<path>.audit.md.
Follow your subagent instructions exactly.
```

Run up to 6 in parallel. Each writes one audit file.

## Step 3 — Aggregate

Read all `.audits/*.audit.md` files. Build a single summary report at
`docs/spec/.audits/SUMMARY.md`:

```markdown
# Spec Audit Summary — <date>

## Drift detected (N pages)

- [docs/spec/contracts/ipc-handlers.md](../contracts/ipc-handlers.md) — 3 drift findings
- [docs/spec/domain/cost-basis.md](../domain/cost-basis.md) — 1 drift finding

## Clean (M pages)

…

## Missing-link findings (K)

- Page X links to feature us-99 which doesn't exist.

## Recommended next steps

- Run `/update-spec <us-N>` for pages where the related plan has new content.
- Manually fix drift in pages where code has changed but plans haven't.
```

## Step 4 — Print

Show the user a terse summary in chat (counts only) and point them at
`docs/spec/.audits/SUMMARY.md` for detail.

## Rules

- **Read-only on docs/spec/ except `.audits/`.** Never edit spec pages or
  extracts. Suggesting fixes is the auditor's output, applying them is the
  user's call (or `/update-spec` if a plan has changed).
- **Don't audit `.extracts/`.** Those are intermediate; nothing to verify them
  against.
- **Be conservative about "drift".** If a claim is too narrative to mechanically
  verify, mark it "unverifiable" — don't false-positive.
