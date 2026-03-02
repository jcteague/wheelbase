---
name: require-quality-before-stop
enabled: true
event: stop
pattern: .*
action: block
---

**Before stopping, confirm all quality checks have passed.**

Run the full post-change checklist (in order):
1. **Format** — `make format` (properly formatted) 
2. **Lint** — `make lint` (zero errors)
3. **Type-check** — `make typecheck` (zero TypeScript errors)

If you have not run these checks since your last code change, run them now and fix any failures before stopping. Do not consider the task done until all three are clean.
