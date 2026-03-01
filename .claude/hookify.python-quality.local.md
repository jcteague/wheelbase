---
name: python-quality-check
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.py$
action: warn
---

**Python file edited — run quality checks before proceeding.**

You just edited a Python file. Run these checks now (from the project root):

```bash
cd backend && uv run ruff check --fix <file> && uv run ruff format <file>
```

Or run all backend checks at once:

```bash
make lint
```

Do not mark work complete until `make lint` passes clean.
