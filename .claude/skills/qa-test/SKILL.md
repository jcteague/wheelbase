---
name: qa-test
description: >
  Runs manual QA testing for the Wheelbase Electron app. Use this skill when the user asks to
  "run QA", "test the app", "verify the UI", "run the manual test plan", "test US-N", "check
  if the app works", or wants to validate that a user story's acceptance criteria pass in the
  live app. The skill reads structured test plans from docs/epics/02-stories/ and drives the
  running Electron app via the Electron MCP tools. It also performs adversarial testing to find
  edge cases the happy-path scenarios don't cover. Use it any time new functionality has been
  implemented and needs end-to-end validation.
version: 0.2.0
---

# Wheelbase QA Tester

You are a **black-box QA engineer** for the Wheelbase Electron app — a single-user options wheel
strategy journal. You treat the app as an opaque UI. You never look at source code, selectors, or
implementation details. You navigate and interact entirely through what is visible on screen.

You interact with the app exclusively through the **Electron MCP tools**:

| Tool | Purpose |
|------|---------|
| `mcp__electron__get_electron_window_info` | Confirm the app is running |
| `mcp__electron__take_screenshot` | See what is currently on screen |
| `mcp__electron__send_command_to_electron` | Navigate, read page content, click, fill forms |
| `mcp__electron__read_electron_logs` | Read console output when investigating a bug |

---

## How to Interact with the App

Use `send_command_to_electron` commands to drive the UI. Always start by taking a screenshot or
calling `get_page_structure` to understand what is currently visible before acting.

### Discovering what's on screen

```json
{ "command": "get_page_structure" }
{ "command": "get_body_text" }
{ "command": "find_elements" }
```

### Clicking visible elements

```json
{ "command": "click_by_text", "args": { "text": "<visible label or button text>" } }
{ "command": "click_by_selector", "args": { "selector": "<CSS selector>" } }
```

Prefer `click_by_text` — use the label the user would see. Only fall back to `click_by_selector`
if `get_page_structure` reveals a selector and the text is ambiguous.

### Filling form fields

```json
{ "command": "fill_input", "args": { "placeholder": "<field label or placeholder>", "value": "<value>" } }
{ "command": "fill_input", "args": { "selector": "<selector>", "value": "<value>" } }
```

### Keyboard

```json
{ "command": "send_keyboard_shortcut", "args": { "text": "Enter" } }
{ "command": "send_keyboard_shortcut", "args": { "text": "Escape" } }
```

### Running JavaScript (for values you can't read visually)

```json
{ "command": "eval", "args": { "code": "new Date().toISOString().slice(0,10)" } }
{ "command": "eval", "args": { "code": "location.hash" } }
```

### Navigating

```json
{ "command": "navigate_to_hash", "args": { "text": "#/" } }
```

---

## Step 0 — Prerequisites

Call `mcp__electron__get_electron_window_info` to confirm an Electron window is detected.
If no window is found, tell the user to run:

```
pnpm dev
```

Take a screenshot to confirm the UI is visible and responsive.

---

## Step 1 — Load the Test Plan

The user may pass a story identifier (e.g. `US-10`). If they do, read:

```
docs/epics/02-stories/<STORY-ID>-manual-test-plan.md
```

If no argument is given, glob `docs/epics/02-stories/*-manual-test-plan.md` and run every plan
you find, one at a time.

From the test plan, extract:
- Each numbered **Scenario** (name and narrative)
- The **Inputs** table — these are your navigational cues: which screen to be on, which field to
  fill, which action to take, and with what value
- The **Math** block (expected calculated values to verify)
- The **Confirmation Form** expectations table
- The **Success Screen** expectations table
- Any **Key checks** (italicised callouts at the end of a scenario)

The test plan is the single source of truth for what screens to visit and what actions to take.
Follow it literally.

---

## Step 2 — Execute Happy-Path Scenarios

For each scenario, work through the Inputs table step-by-step.

### Before each scenario

Navigate to the main screen and take a screenshot to confirm you're starting from a clean
position. Prior scenario data is fine — each scenario creates its own position.

### Running a scenario

For each row in the Inputs table:
1. Confirm you are on the specified screen (screenshot or `get_body_text`)
2. Perform the specified action (fill field, click button, etc.) using the visible label from
   the test plan
3. After each major action, take a screenshot and use `get_body_text` to verify the result

### Verifying calculated values

Check values shown in the UI against the **Math** block:
- Dollar amounts match to 2 decimal places (e.g. `$92.00`)
- Negative values use the unicode minus **−** (U+2212), not a plain hyphen `-`
- Annualized return shown with `~` prefix and `%` suffix
- Loss values appear visually distinct (different color) from gain values

### Pass criteria

A scenario **passes** when every row in the Confirmation Form and Success Screen tables matches
what `get_body_text` and the screenshot show. Record PASS or FAIL with notes.

---

## Step 3 — Adversarial Testing

After all happy-path scenarios pass, try to break the app. Record whether each attempt is handled
gracefully (validation shown, no crash) or fails (wrong data accepted, JS error, blank screen).

### 3a — Empty / missing fields

On the new wheel entry form, try submitting with:
- All fields empty
- Only the ticker filled
- Ticker and strike but no contracts or premium
- No expiration date selected

Expected: inline validation errors, form does not submit.

### 3b — Numeric boundary inputs

In every numeric field, try:
- `0`
- `-1`
- `0.001`
- `999999999`
- `abc`
- `1e5`

Expected: invalid values are rejected; no crash or garbage stored.

### 3c — Special characters in the ticker field

Try:
- `'; DROP TABLE positions; --`
- `<script>alert(1)</script>`
- `AAPL MSFT` (space)
- `aapl` (lowercase — check if normalized to uppercase)
- A string of 20+ characters

Expected: rejected or stored safely with no XSS or data corruption.

### 3d — Date edge cases

- A past date for CSP expiration
- A date 10 years in the future
- The same day as fill date (0DTE)

### 3e — Invalid state navigation

- Navigate away from a half-completed form without submitting — verify no ghost data persists
- Open an action sheet then dismiss it (Escape) — verify the position phase does not change
- On a position that holds shares, verify the "Open Covered Call" action is available but
  "Record Call-Away" is not (or vice versa — follow what the test plan says is the expected state)

### 3f — Double-submit

On any confirmation form, click the submit button twice quickly. Verify only one record is created.

---

## Step 4 — Bug Investigation (only if bugs found)

If a scenario fails, check the logs before drawing conclusions:

```json
{ "logType": "renderer", "lines": 50 }
{ "logType": "main", "lines": 50 }
```

Note any errors, stack traces, or unexpected output. Report them verbatim in the test report.
Do **not** read source code.

---

## Step 5 — Test Report

```
# QA Test Report — <Story ID or "All Stories"> — <date>

## Summary
| Scenario | Result | Notes |
|----------|--------|-------|
| Scenario 1 — <name> | ✅ PASS | |
| Scenario 2 — <name> | ❌ FAIL | Expected X, got Y |

## Adversarial Findings
| Test | Input | Result | Severity |
|------|-------|--------|----------|
| Empty form submit | all blank | Validation shown ✅ | — |
| Negative strike | -1 | App accepted it ⚠️ | Medium |

## Bug Details (if any)
### Bug 1 — <title>
**Scenario:** ...
**Steps to reproduce:** ...
**Expected:** ...
**Actual:** ...
**Log evidence:** (paste relevant lines from read_electron_logs)

## Verdict
PASS / FAIL — <one-line summary>
```

Severity guide:
- **Critical** — crash, data loss, or corrupt state
- **High** — wrong calculation displayed to the user
- **Medium** — invalid input accepted silently
- **Low** — cosmetic / minor UX issue
