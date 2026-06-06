# Skills — canonical location

This directory (`.agents/skills/`) is the **source of truth** for skill files used by
all agents working on this repo.

`.claude/skills/` contains symlinks pointing back here. Edits made via either path land
in the same file.

## Why

Multiple agents read skills from different paths:

- **Claude Code** → `.claude/skills/`
- **Codex** → `.agents/skills/`
- **GitHub Copilot** → doesn't read skills at all (see [Copilot](#copilot) below)

The skills used to be duplicated. The duplicates drifted — Codex's migration
re-serialized YAML in lossy ways (notably destroying `qa-test`'s description), and
Claude-side edits never propagated to the Codex copy. Single source of truth +
symlinks fixes that.

## Editing skills

Edit the file at its real path: `.agents/skills/<skill-name>/SKILL.md`.

Adding a new shared skill:

```bash
# 1. Create the canonical version
mkdir -p .agents/skills/<name>
$EDITOR .agents/skills/<name>/SKILL.md

# 2. Symlink from .claude/skills/
ln -s ../../.agents/skills/<name> .claude/skills/<name>
```

Don't create a real directory under `.claude/skills/` — it'll re-fork.

## What lives where

- **Shared skills** — symlinked between `.claude/skills/` and `.agents/skills/`.
- **`source-command-*` entries** under `.agents/skills/` only — these are Codex's
  converted slash commands. Claude Code has the real commands in `.claude/commands/`
  and doesn't need them mirrored here.

## Copilot

Copilot doesn't load skill files. For guidance that should apply to Copilot too, put
it in `CLAUDE.md` — `AGENTS.md` symlinks to `CLAUDE.md`, and Copilot reads
`AGENTS.md`.

## Externally-managed skills

`skills-lock.json` (at repo root) tracks skills synced from upstream repos:

- `database-schema-design` ← `supercent-io/skills-template`
- `mdx-sanitizer` ← `erichowens/some_claude_skills`
- `vercel-react-best-practices` ← `vercel-labs/agent-skills`

Whatever tool refreshes these should write into `.agents/skills/`. Writes via the
`.claude/skills/` symlink resolve correctly, but verify before relying on it.
