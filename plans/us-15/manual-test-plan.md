# Manual Test Plan: US-15 — Roll Pair Premium & Running Basis Display

Covers the recent changes to:

- `src/renderer/src/components/LegHistoryTable.tsx` — `ROLL_FROM` premium now renders in red with a leading minus (cost to close, not a credit)
- `src/renderer/src/lib/deriveRunningBasis.ts` — `ROLL_FROM` running basis is blank (roll pair is atomic; basis is only shown on `ROLL_TO`); legs after a same-day roll correctly inherit the post-roll basis

## Setup

1. Run `pnpm dev` to start the app.
2. For a clean slate, delete the dev DB:

   ```bash
   rm "$HOME/Library/Application Support/wheelbase-electron/wheelbase-dev.db"
   ```

3. Open a fresh CSP: **AAPL, Strike $180, 1 contract, Premium $3.50, any future expiry, fill date today**.
4. Open the position detail page and scroll to the **Leg History** table. Keep this table visible for every test case.

---

## Test Cases

### TC-1: CSP Open Baseline (pre-roll)

**Precondition:** Position just opened per Setup step 3.

1. Inspect the single row in the Leg History table.
2. **Expected:**
   - **Premium** column: `+$3.50` in **green**.
   - **Running Basis / Share** column: `$176.50` (strike $180 − premium $3.50).
   - No roll group header is rendered.

---

### TC-2: First Roll — ROLL_FROM Premium Renders Red with Minus

**Precondition:** Position in CSP_OPEN per TC-1.

1. Click **Roll CSP →**.
2. Fill: **Cost to close $1.20, new premium $2.80, same strike $180, new (later) expiration, fill date today**.
3. Submit.
4. Return to the position detail Leg History.
5. **Expected:** Inside Roll group **Roll #1**, the `ROLL_FROM` row shows:
   - **Premium** column: `−$1.20` in **red** (not green, not gold).
   - **Action** column: `BUY`.
   - The row is indented and uses the roll-pair background tint.

---

### TC-3: ROLL_FROM Running Basis Is Blank

**Precondition:** TC-2 complete.

1. In the **Running Basis / Share** column, inspect the `ROLL_FROM` row.
2. **Expected:** Cell is empty (renders as a secondary-color `—` dash), **not** the pre-roll $176.50.

---

### TC-4: ROLL_TO Running Basis Shows Post-Roll Value

**Precondition:** TC-2 complete.

1. In the same Roll #1 group, inspect the `ROLL_TO` row.
2. **Expected:**
   - **Premium** column: `+$2.80` in green.
   - **Running Basis / Share** column: `$174.90` (prior $176.50 − net credit $1.60).

---

### TC-5: Roll Group Net Credit Header Unchanged

**Precondition:** TC-2 complete.

1. Inspect the Roll #1 group header row (spans the full table width above the `ROLL_FROM` row).
2. **Expected:** Header shows **Roll #1**, an appropriate roll-type badge, and `Net Credit +$1.60/contract ($160.00 total)` in green. This behavior should be unaffected by the `ROLL_FROM` premium-color change.

---

### TC-6: Second Roll — Both Rolls Render Correctly

**Precondition:** TC-2 complete (Roll #1 exists).

1. Click **Roll CSP →** again.
2. Fill: **Cost to close $0.90, new premium $1.50, same strike $180, later expiration, fill date today or any valid later day**.
3. Submit and return to the Leg History.
4. **Expected:**
   - Two roll groups render in chronological order: **Roll #1** then **Roll #2**.
   - In **Roll #2**: `ROLL_FROM` premium is `−$0.90` in red, running basis cell is blank; `ROLL_TO` premium is `+$1.50` in green, running basis is `$174.30` (prior $174.90 − net credit $0.60).
   - Cumulative Roll Summary row below the groups shows combined credits and net.

---

### TC-7: Regression — Leg After a Same-Day Roll Inherits Post-Roll Basis

**Precondition:** TC-6 complete (two rolls on same CSP). Advance the position through assignment and into CC_OPEN:

1. Click **Record Assignment →**, confirm assignment at strike $180.
2. Click **Open Covered Call →**, fill: Strike $185, Premium $1.10, future expiry, fill date today. Submit.
3. Return to Leg History.
4. **Expected:** The `CC_OPEN` row's **Running Basis / Share** column shows a numeric basis (the assignment-strike-based post-roll basis carried forward from the last `ROLL_TO`) — **not** blank and **not** the pre-roll basis. The new CC leg should not be "wiped" by the null from the preceding `ROLL_FROM`.

> This is the regression guarded by the `deriveRunningBasis` test `"a leg after a ROLL_FROM on the same day still inherits the prior-day basis"`.

---

### TC-8: Non-Roll Legs Unaffected

**Precondition:** Any position with a mix of non-roll legs (e.g. CSP_OPEN, CC_OPEN, CC_CLOSE).

1. Inspect each non-roll row's **Premium** column.
2. **Expected (no regressions):**
   - `CSP_OPEN` / `CC_OPEN` with non-zero premium: `+$X.XX` in green.
   - `CC_CLOSE`: `−$X.XX` in gold.
   - `CC_EXPIRED`: italic `expired worthless`.
   - `ASSIGN` / `CALLED_AWAY`: italic `— (assigned)` with shares annotation.
   - Running basis cells render numerically for non-roll legs, blank only for `ROLL_FROM`.

---

### TC-9: Final P&L Footer Unchanged

**Precondition:** A closed/completed wheel (called away or otherwise terminal) with rolls in its history.

1. Scroll to the Leg History footer.
2. **Expected:** Final P&L value and color match the terminal wheel outcome; nothing about the roll row changes should affect the footer.

---

## Pass Criteria

- All 9 test cases produce the expected output with no console errors.
- `ROLL_FROM` rows consistently show **red `−$X.XX`** premium and a **blank** running basis cell.
- `ROLL_TO` rows and any legs that follow a same-day roll always display a numeric running basis.
- `pnpm test`, `pnpm typecheck`, and `pnpm lint` all pass.
