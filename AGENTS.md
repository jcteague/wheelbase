# Agent Instructions

This project uses **markdown task files** for work tracking. Tasks live in `plans/<story-id>/tasks.md` as checkboxes.

## Quick Reference

- Open tasks: `- [ ]` — check off when done: `- [x]`
- Task files: `plans/<story-id>/tasks.md`
- Create task files: `/plan-tasks plans/<story-id>/plan.md`
- Execute tasks: `/implement-plan <story-id>`

## Non-Interactive Shell Commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

**Use these forms instead:**
```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# For recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

**Other commands that may prompt:**
- `scp` - use `-o BatchMode=yes` for non-interactive
- `ssh` - use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` - use `-y` flag
- `brew` - use `HOMEBREW_NO_AUTO_UPDATE=1` env var

## Task Tracking

This project uses **markdown task files** — no external issue tracker.

### Task File Location

`plans/<story-id>/tasks.md` — one file per user story.

### Task Format

```markdown
- [ ] **[Red]** Write failing tests — `path/to/test.ts`
- [x] **[Green]** Implement — `path/to/impl.ts` *(depends on: Red ✓)*
- [ ] **[Refactor]** Clean up *(depends on: Green ✓)*
```

Check off tasks as you complete them: `[ ]` → `[x]`

### Workflow for AI Agents

1. **Find work**: Read `plans/<story-id>/tasks.md` — look for unchecked `- [ ]` tasks
2. **Check dependencies**: Only start a task when all its `*(depends on: ...)*` items are checked off
3. **Work on it**: Use `/red`, `/green`, or `/refactor` commands
4. **Complete**: Edit tasks.md and change `- [ ]` to `- [x]`

### Parallel Execution

Tasks are organized into **layers** in tasks.md. All areas within a layer can be dispatched as parallel agents. Areas in later layers must wait for their upstream dependencies to be checked off.

### Important Rules

- ✅ Track all work in `plans/<story-id>/tasks.md`
- ✅ Respect dependency order — Red before Green before Refactor
- ✅ Check off tasks immediately when done
- ❌ Do NOT use external issue trackers

## Landing the Plane (Session Completion)

**When ending a work session**, complete ALL steps below before stopping.

**MANDATORY WORKFLOW:**

1. **Note remaining work** — add any discovered tasks to the relevant `tasks.md`
2. **Run quality gates** (if code changed) — `pnpm test && pnpm lint && pnpm typecheck`
3. **PUSH TO REMOTE** — This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
4. **Verify** — All changes committed AND pushed
5. **Hand off** — Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
