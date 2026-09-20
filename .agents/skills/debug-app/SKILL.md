---
name: debug-app
description: Starts the Wheelbase Electron app in debug mode so an agent can see the live UI and the main-process pino logs at the same time. Use this skill when the user asks to "start the app in debug mode", "debug this issue in the app", "run the app so you can see the logs", "reproduce the bug", "verify the feature works in the app", "check the logs while I click", or when a debugging or feature-verification session needs both a screenshot of the UI and the log lines it produced. Launches pnpm dev in the background with logs captured to a file, attaches the Playwright MCP tools over the Chrome DevTools Protocol, and gives a loop for correlating UI actions with log output. For scripted acceptance-criteria walkthroughs hand off to qa-test once the app is up.
---

# Wheelbase Debug Mode

You are debugging or verifying the Wheelbase Electron app. You need two views at once:

1. **The UI** — snapshots, screenshots, clicks, and renderer console via the Playwright MCP
   tools, attached to the live window over the Chrome DevTools Protocol
2. **The main-process logs** — pino output from services, IPC handlers, alerts, and the
   broker/market-data adapters, which only appear on the `pnpm dev` stdout

This skill wires both up. Unlike `qa-test`, you **may** read source code here — the goal is
to explain behaviour, not to black-box it.

| Tool                                        | Purpose                                            |
| ------------------------------------------- | -------------------------------------------------- |
| `Bash` (run_in_background)                  | Launch `pnpm dev`, capture stdout/stderr to a file |
| `Bash` `tail` / `grep` on the log file      | Read main-process pino logs                        |
| `mcp__playwright__browser_snapshot`         | Confirm the window is attached; read what is on it |
| `mcp__playwright__browser_take_screenshot`  | See the UI                                         |
| `mcp__playwright__browser_click` / `_type`  | Drive the UI by snapshot `ref`                     |
| `mcp__playwright__browser_navigate`         | Change the hash route                              |
| `mcp__playwright__browser_evaluate`         | Run JS in the renderer                             |
| `mcp__playwright__browser_console_messages` | Renderer console (React errors, TanStack Query)    |
| `mcp__playwright__browser_network_requests` | Renderer HTTP calls (should be none — IPC only)    |

The `playwright` server in `.mcp.json` connects with `--cdp-endpoint http://localhost:9222`.
That port is opened by `pnpm dev`, so the server can only attach once the app is running. If
the Playwright tools report a connection error, the app is not up yet or another Electron
process holds the port — do not launch a separate browser to work around it.

---

## Step 0 — Preflight

Run these checks before launching. Each one has bitten a previous session.

```bash
# 1. Port 9222 must be free — dev mode always binds it, and the MCP server attaches to it.
lsof -i :9222 -sTCP:LISTEN

# 2. No stray Electron from another worktree's e2e run.
pgrep -fl "wheelbase.*Electron|electron.*out/main" || true
```

If either shows a process, tell the user what it is and ask before killing it — it may be
a session they are using in another worktree.

```bash
# 3. better-sqlite3 must be on the Electron ABI. pnpm skips the predev hook, so this is manual.
#    Run it if `pnpm test` (Vitest) has been run since the app last launched, or if unsure.
pnpm rebuild:electron
```

Symptom of skipping this: the log shows `NODE_MODULE_VERSION <n> ... requires <m>` and no
window ever appears.

---

## Step 1 — Launch

Log level: `.env` sets `MAIN_VITE_LOG_LEVEL=debug`, which electron-vite bakes in at dev
time. Confirm with `grep LOG_LEVEL .env`; if it is not `debug`, export it for this launch.

Write the log into the session scratchpad so it never lands in the repo:

```bash
LOG=<scratchpad>/wheelbase-dev.log
MAIN_VITE_LOG_LEVEL=debug pnpm dev > "$LOG" 2>&1
```

Run that with `run_in_background: true`. Note the task id so you can stop it later.

### Optional: isolated database

The dev app uses `wheelbase-dev.db` in Electron's userData directory — the user's real
journal. For a clean reproduction, or when the bug might corrupt data, point the app at a
fresh file instead:

```bash
WHEELBASE_DB_PATH=<scratchpad>/repro.db MAIN_VITE_LOG_LEVEL=debug pnpm dev > "$LOG" 2>&1
```

Migrations run automatically on the empty file. Say which DB you launched against in your
report — a bug that only reproduces on the user's data is a different finding.

---

## Step 2 — Confirm it is up

Poll until both are true (give it up to ~60 s on a cold start):

```bash
grep -c "" "$LOG"            # log is growing
grep -E '"level":50|NODE_MODULE_VERSION|EADDRINUSE' "$LOG" | head   # nothing fatal
```

Do not grep for `error`: with no broker configured, debug-level lines carry a
`MarketDataError` stack for every scheduler tick, and that is expected noise, not a failure.

Then call `browser_snapshot` and `browser_take_screenshot`. If the snapshot still reports a
connection error after 60 s, read the tail of the log and report the actual error rather
than retrying blind.

Call `browser_take_screenshot` **without** a `filename`. The MCP server can only write under
the repo root; a scratchpad path is rejected as "outside allowed roots". Its default
`.playwright-mcp/` directory is git-ignored, so the screenshots never land in a commit.

---

## Step 3 — The observe loop

For every UI action you take, capture the logs it produced. Pino lines are JSON with a
`time` field (epoch ms); use it to bracket each step.

```bash
# Mark where this step starts
START=$(wc -l < "$LOG")

# ... drive the UI with browser_click / browser_type ...

# Read only what the step produced
tail -n +"$((START + 1))" "$LOG"
```

Useful filters:

```bash
grep '"level":50' "$LOG"                 # errors (pino level 50)
grep '"level":40' "$LOG"                 # warnings
grep -i 'alert\|evaluateAlerts' "$LOG"   # alert engine
grep -i 'alpaca\|market' "$LOG"          # broker / market-data adapters
grep -i 'ipc\|handler' "$LOG"            # IPC boundary
```

Pair each with `browser_console_messages` when the symptom is in the renderer
(blank screen, stale query, form validation that never fires).

### Reproducing a bug

1. Take a screenshot of the starting state.
2. Perform the minimal steps the user described. One action per log bracket.
3. Screenshot the failing state.
4. Quote the exact log lines (or their absence) alongside the screenshot.

If the logs are silent where you expected a business event, that is itself a finding: the
logging standards call for INFO on business events and DEBUG on inputs and checkpoints.
Propose the missing log line, but do not add it to `src/main/core/` — the engines are pure.

### Verifying a feature

1. Read the story's acceptance criteria from Linear (`get_issue`), not from a markdown file.
2. Walk each criterion in the UI and record: screenshot, the log lines that prove the
   service ran, and pass/fail.
3. For a full scripted walkthrough of a manual test plan, invoke `qa-test` now — the app is
   already running, so it will skip its own launch prompt.

### Editing while it runs

electron-vite hot-reloads renderer changes in place. A change under `src/main/` or
`src/preload/` restarts the Electron process automatically; the CDP connection drops for a
few seconds, so re-run `browser_snapshot` before continuing. The log file keeps
appending across the restart.

---

## Step 4 — Shut down

Stop the background task (TaskStop with the task id), then verify nothing is left holding
the port:

```bash
lsof -i :9222 -sTCP:LISTEN || echo "port free"
```

If the user is about to run `pnpm test`, remind them (or run) `pnpm rebuild:node` — the
launch left better-sqlite3 on the Electron ABI.

Leave the log file in the scratchpad; do not commit it.

---

## Report format

Lead with the conclusion, then the evidence in this order:

- **What happened vs. expected** — one sentence each.
- **Repro steps** — numbered, as performed, with the DB used (user's dev DB or isolated).
- **Evidence** — the screenshot(s) and the exact log lines, in a fenced block, trimmed to
  the relevant fields. Say explicitly when an expected log line was absent.
- **Where in the code** — `file:line` for the handler, service, or component implicated.
  Only include this once you have read the code and can point at the specific site.
- **Suggested fix or next step** — but do not apply a fix unless the user asked for one.
