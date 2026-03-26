# Manual Test Plan: US-8 — Close Covered Call Early

## Setup

1. Run `pnpm dev` to start the app
2. Delete the dev database if you want a clean slate:
   ```bash
   rm "$HOME/Library/Application Support/wheelbase-electron/wheelbase-dev.db"
   ```
3. Create a fresh position and advance it to **CC_OPEN** state:
   - Open new position: AAPL, Strike $180, 1 contract, Premium $3.50, any future expiry
   - On the position detail page, click **Record Assignment →**, set today's date, confirm
   - Verify phase shows **HOLDING SHARES**
   - Click **Open Covered Call →**, fill in: Strike $182, Premium $2.30, future expiry, today's fill date, submit
   - Verify phase shows **CC OPEN**

> **Note:** On the assignment success screen, the "Open Covered Call on AAPL →" button opens the CC sheet for the existing position — do not use it to navigate to a fresh position form.

---

## Test Cases

### TC-1: Happy Path — Profitable Close

**Precondition:** Position in CC_OPEN state (setup above)

1. Click **Close CC Early →** button in the position detail
2. Verify the sheet opens with title "Close Covered Call Early"
3. Verify the position summary shows:
   - Ticker: AAPL, Strike: $182
   - Contracts: 1 (read-only)
   - Open premium: $2.30/contract
   - Phase transition badges: Sell Call → Holding Shares
   - Cost basis shows `(unchanged)`
4. Enter close price: `1.10`
5. **Expected:** P&L preview shows `+$120.00 profit · 52.2% of max`
6. Set fill date to today
7. Click **Confirm Close**
8. **Expected results:**
   - Success card shows `+$120.00`
   - Phase badges show Sell Call → Holding Shares
   - Leg recorded as `CC_CLOSE` with fill price $1.10
   - "Sell New Covered Call on AAPL →" CTA is visible
   - "View full position history" link is visible
   - Cost basis shown as `(unchanged)`

---

### TC-2: Loss Close (Close Price > Open Premium)

**Precondition:** Position in CC_OPEN state

1. Click **Close CC Early →**
2. Enter close price: `3.50`
3. **Expected:** P&L preview shows `−$120.00 loss · 52.2% above open`
4. Set fill date to today, click **Confirm Close**
5. **Expected results:**
   - Success card shows `−$120.00`
   - `CC_CLOSE` leg recorded with $3.50
   - Position is back in Holding Shares

---

### TC-3: P&L Preview — Break-Even

**Precondition:** Position in CC_OPEN state. Open a new CC if needed (Strike $182, Premium $2.30). Click **Close CC Early →** to open the sheet — do **not** submit.

1. Enter close price: `2.30` (same as open premium)
2. **Expected:** Preview shows `$0.00 break-even`
3. Do not submit — close the sheet with Cancel

---

### TC-4: P&L Preview — 50% of Max

**Precondition:** Position in CC_OPEN state. If the sheet from TC-3 is still open, just clear the price field and continue. If you cancelled, click **Close CC Early →** again — no need to open a new CC.

1. Enter close price: `1.15`
2. **Expected:** Preview shows `+$115.00 profit · 50.0% of max`
3. Do not submit — close the sheet with Cancel

---

### TC-5: Validation — Zero Close Price

**Precondition:** Sheet is open

1. Enter close price: `0`
2. Click **Confirm Close**
3. **Expected:** Error "Close price must be greater than zero", form stays open

---

### TC-6: Validation — Negative Close Price

**Precondition:** Sheet is open

1. Enter close price: `-1`
2. Click **Confirm Close**
3. **Expected:** Same error as TC-5

---

### TC-7: Validation — Fill Date Before CC Open Date

**Precondition:** Sheet is open (CC was opened today)

1. Enter close price: `1.10`
2. Set fill date to ~30 days ago (before today's CC open date)
3. Click **Confirm Close**
4. **Expected:** Error "Fill date cannot be before the CC open date"

---

### TC-8: Validation — Fill Date After CC Expiration

**Precondition:** Sheet is open

1. Enter close price: `1.10`
2. Set fill date to one day after the CC expiration date
3. Click **Confirm Close**
4. **Expected:** Error "Fill date cannot be after the CC expiration date"

---

### TC-9: Button Absent When Not in CC_OPEN

**Precondition:** Position in HOLDING_SHARES (assigned, no CC open)

1. Open the position detail page
2. **Expected:** No "Close CC Early →" button is visible

---

### TC-10: Cancel Closes the Sheet

**Precondition:** Sheet is open

1. Click **Cancel**
2. **Expected:** Sheet closes, position detail restored, no changes to position

---

### TC-11: Cost Basis Unchanged After Close

**Precondition:** Successfully completed TC-1

1. On the position detail page, check the cost basis
2. **Expected:** Cost basis per share is identical to what it was before the CC close

---

### TC-12: Success — "Sell New Covered Call" CTA

**Precondition:** Successfully completed TC-1

1. On the success screen, click **Sell New Covered Call on AAPL →**
2. **Expected:** Sheet closes and returns to position detail

---

### TC-13: Success — "View Full Position History"

**Precondition:** Successfully completed TC-1

1. Click **View full position history**
2. **Expected:** Sheet closes and returns to position detail, leg history shows both `CC_OPEN` and `CC_CLOSE` legs
