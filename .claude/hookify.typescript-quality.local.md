---
name: typescript-quality-check
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.(ts|tsx)$
action: warn
---

**TypeScript file edited — run quality checks before proceeding.**

You just edited a TypeScript/TSX file. Run these checks now:

```bash
make lint       # ESLint (frontend)
make typecheck  # TypeScript type checking (tsc --noEmit)
```

Fix all lint errors and type errors before marking work complete. Do not suppress errors with `// @ts-ignore` or `eslint-disable` comments unless there is a documented, legitimate reason.
