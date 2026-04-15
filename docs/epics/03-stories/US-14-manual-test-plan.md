# Manual Test Plan: Roll an Open Covered Call (US-14)

## How to Read This Plan

**Day 0** = today's date. Substitute real calendar dates when running the test.
**Day +N** = N calendar days after today.

Use the app's actual date picker for all dates. All math is decimal; verify with a phone calculator.

---

## Setup (shared across all scenarios)

Work through these steps to reach **CC_OPEN** phase before running any scenario. Scenarios 1–5
each need their own fresh position because they submit the roll. Scenarios 6–8 are validation
tests that never submit — they can share one position.

### Step A: Open a new CSP

| Step | Screen    | Field              | Value   |
| ---- | --------- | ------------------ | ------- |
| 1    | New Wheel | Ticker             | AAPL    |
| 2    | New Wheel | CSP Strike         | 180.00  |
| 3    | New Wheel | Contracts          | 1       |
| 4    | New Wheel | Premium / Contract | 2.00    |
| 5    | New Wheel | Expiration         | Day +30 |
| 6    | New Wheel | —                  | Submit  |

### After creation — verify position detail

| Field             | Expected      |
| ----------------- | ------------- |
| Phase badge       | CSP_OPEN      |
| Strike            | $180.00       |
| Premium collected | $200.00       |
| Cost basis        | $178.00/share |

### Step B: Record assignment

1. Click **"Record Assignment →"**
2. Set Assignment Date = **Day 0** (today)
3. Click **"Confirm Assignment"**
4. Verify phase badge shows **HOLDING 100 SHARES**
5. Click **"View full position history"**

### Step C: Open a covered call

1. Click **"Open Covered Call →"**
2. Fill in:

| Field      | Value   |
| ---------- | ------- |
| Strike     | 182.00  |
| Contracts  | 1       |
| Premium    | 2.00    |
| Expiration | Day +21 |
| Fill Date  | Day 0   |

3. Submit. Verify phase badge shows **CC OPEN**.
4. Click **"View full position history"** to reach position detail.

### Verify CC_OPEN state

| Field             | Expected                |
| ----------------- | ----------------------- |
| Phase badge       | CC OPEN · CALL $182.00  |
| Cost basis        | $176.00/share           |
| Premium collected | $400.00                 |
| Action button     | **"Roll CC →"** visible |

### Math — starting cost basis

```
CSP premium collected:   $2.00 × 1 × 100  =  $200.00
CC premium collected:    $2.00 × 1 × 100  =  $200.00

cost basis  =  assignment strike − premiums collected per share
            =  $180.00 − $2.00 (CSP) − $2.00 (CC)
            =  $176.00/share
```

---

## Scenario 1 — Roll Up & Out (Net Credit, Happy Path)

> **Story:** AAPL has risen toward $182. The trader rolls to a higher strike and a later date,
> collecting a net credit of $1.00/contract.

### Step 1: Open the roll form

Click **"Roll CC →"** on the position detail page.

### Roll form — what to see

| Field                           | Expected                    |
| ------------------------------- | --------------------------- |
| Sheet title                     | "Roll Covered Call"         |
| Current Leg > Strike            | $182.00                     |
| Current Leg > Expiration        | Day +21 (with DTE count)    |
| Current Leg > Premium collected | +$2.00/contract ($200.00)   |
| Current Leg > Cost basis        | $176.00/share (highlighted) |
| New Strike field                | Pre-filled with 182.00      |
| New Expiration field            | Empty                       |
| Cost to Close field             | Empty                       |
| New Premium field               | Empty                       |

### Step 2: Enter roll values

| Field          | Value   |
| -------------- | ------- |
| New Strike     | 185.00  |
| New Expiration | Day +42 |
| Cost to Close  | 1.50    |
| New Premium    | 2.50    |

### Net credit preview — what to see

| Field   | Expected        |
| ------- | --------------- |
| Label   | "Net Credit"    |
| Amount  | +$1.00/contract |
| Total   | ($100.00 total) |
| Color   | **Green**       |
| Warning | None            |

### Roll type badge — what to see

| Field           | Expected                                 |
| --------------- | ---------------------------------------- |
| Eyebrow / badge | **Roll Up & Out** (strike up, exp later) |

### Math — verify before clicking Confirm

```
netCredit         =  newPremium − costToClose
                  =  2.50 − 1.50
                  =  $1.00/contract

total             =  1.00 × 1 contract × 100  =  $100.00

newBasisPerShare  =  prevBasis − netCredit
                  =  176.00 − 1.00
                  =  $175.00/share
```

### Step 3: Confirm the roll

Click **"Confirm Roll"**.

### Success screen — what to see

| Field          | Expected                             |
| -------------- | ------------------------------------ |
| Header caption | "Roll Complete" (green)              |
| Title          | "CC Rolled Successfully"             |
| Subtitle       | AAPL CALL $182.00 → CALL $185.00     |
| Hero label     | "ROLL NET CREDIT"                    |
| Hero amount    | **+$1.00** (green, large)            |
| Hero total     | $100.00 total · 1 contract           |
| Roll type      | Roll Up & Out                        |
| Old leg        | ROLL_FROM · BUY CALL $182.00 @ $1.50 |
| New leg        | ROLL_TO · SELL CALL $185.00 @ $2.50  |
| New expiration | Day +42 (with DTE)                   |
| Roll chain ID  | 8-character UUID prefix (any value)  |
| Phase          | CC_OPEN (unchanged)                  |
| Cost basis     | … → $175.00/share (highlighted)      |

### Step 4: Close sheet and verify position detail

Close the success sheet (× button).

| Field       | Expected                              |
| ----------- | ------------------------------------- |
| Phase badge | CC OPEN · CALL $185.00                |
| Expiration  | **Day +42** (updated to new leg)      |
| Cost basis  | **$175.00/share**                     |
| Leg history | ROLL_FROM and ROLL_TO entries visible |
| "Roll CC →" | Still visible                         |

---

## Scenario 2 — Net Debit Roll

> **Story:** The CC is deep ITM. Buying it back costs more than the new premium. The trader rolls
> anyway to buy time, accepting a net debit of $0.50/contract.

### Setup

Create a new AAPL position and complete the full CC_OPEN setup (Steps A–C above).

### Step 1: Open roll form and enter values

| Field          | Value   |
| -------------- | ------- |
| New Strike     | 185.00  |
| New Expiration | Day +42 |
| Cost to Close  | 3.00    |
| New Premium    | 2.50    |

### Net debit preview — what to see

| Field   | Expected                                                      |
| ------- | ------------------------------------------------------------- |
| Label   | "Net Debit"                                                   |
| Amount  | −$0.50/contract                                               |
| Total   | ($50.00 total)                                                |
| Color   | **Amber/gold** (not green)                                    |
| Warning | "This roll costs more to close than the new premium provides" |

### Math

```
netDebit   =  costToClose − newPremium
           =  3.00 − 2.50
           =  $0.50/contract

total      =  0.50 × 1 × 100  =  $50.00

newBasis   =  176.00 + 0.50  =  $176.50/share   ← basis increases on a debit roll
```

### Step 2: Confirm the roll

Confirm Roll button must be **enabled** — debit rolls are permitted.

### Success screen — what to see

| Field         | Expected                               |
| ------------- | -------------------------------------- |
| Hero label    | "ROLL NET DEBIT"                       |
| Hero amount   | **−$0.50** (**amber/gold**, not green) |
| Header border | Amber/gold (not green)                 |
| Cost basis    | … → **$176.50/share** (basis went up)  |

> **Key check:** Every green element from Scenario 1 should be amber/gold here — hero amount,
> hero label, "Roll Complete" caption, and header border.

---

## Scenario 3 — Roll Out (Same Strike, Later Expiration)

> **Story:** The trader extends the duration without changing the strike.

### Setup

Create a new AAPL position and complete the CC_OPEN setup.

### Enter roll values

| Field          | Value                                  |
| -------------- | -------------------------------------- |
| New Strike     | 182.00 (same — default, do not change) |
| New Expiration | Day +42                                |
| Cost to Close  | 1.00                                   |
| New Premium    | 1.50                                   |

### What to see

| Field      | Expected                 |
| ---------- | ------------------------ |
| Roll badge | **Roll Out**             |
| Net Credit | +$0.50/contract ($50.00) |

### Math

```
netCredit  =  1.50 − 1.00  =  $0.50/contract
newBasis   =  176.00 − 0.50  =  $175.50/share
```

Confirm, verify success screen shows "Roll Out" and new basis $175.50.

---

## Scenario 4 — Roll Down & Out (Defensive Roll, Lower Strike)

> **Story:** The stock dropped. The trader rolls down to a lower strike at a later expiration.

### Setup

Create a new AAPL position and complete the CC_OPEN setup.

### Enter roll values

| Field          | Value   |
| -------------- | ------- |
| New Strike     | 179.00  |
| New Expiration | Day +42 |
| Cost to Close  | 0.50    |
| New Premium    | 1.50    |

### What to see

| Field      | Expected                  |
| ---------- | ------------------------- |
| Roll badge | **Roll Down & Out**       |
| Net Credit | +$1.00/contract ($100.00) |

### Math

```
netCredit  =  1.50 − 0.50  =  $1.00/contract
newBasis   =  176.00 − 1.00  =  $175.00/share
```

Confirm, verify success shows "Roll Down & Out" and new basis $175.00.

---

## Scenario 5 — Roll Up (Same Expiration, Higher Strike)

> **Story:** The stock rose sharply. The trader rolls to a higher strike on the same expiration.

### Setup

Create a new AAPL position and complete the CC_OPEN setup.

### Enter roll values

| Field          | Value                                   |
| -------------- | --------------------------------------- |
| New Strike     | 185.00                                  |
| New Expiration | Day +21 (same as current CC expiration) |
| Cost to Close  | 1.50                                    |
| New Premium    | 2.00                                    |

### What to see

| Field      | Expected                 |
| ---------- | ------------------------ |
| Roll badge | **Roll Up**              |
| Net Credit | +$0.50/contract ($50.00) |

### Math

```
netCredit  =  2.00 − 1.50  =  $0.50/contract
newBasis   =  176.00 − 0.50  =  $175.50/share
```

Confirm, verify success shows "Roll Up" and new basis $175.50.

---

## Scenario 6 — Below-Cost-Basis Warning (Non-Blocking)

> **Story:** The trader enters a new strike below their $176.00 cost basis. A warning should
> appear but not prevent the roll from being submitted.

### Setup

Use the Scenario 1 position in CC_OPEN state **or** create a fresh one. Do not submit the roll.

### Steps

1. Open the roll form
2. Clear the New Strike field and type **174.00**
3. Leave all other fields empty

### What to see immediately (no submit needed)

| Field                      | Expected                                     |
| -------------------------- | -------------------------------------------- |
| Amber warning              | Visible (below-cost-basis alert)             |
| Warning text               | Contains "below your cost basis" and "$2.00" |
| Confirm Roll               | **Enabled** (warning is non-blocking)        |
| "Cannot be undone" warning | Still visible underneath                     |

### Math — spot check

```
basisDiff  =  basisPerShare − newStrike
           =  176.00 − 174.00
           =  $2.00/share   ← this is the loss per share if called away
```

4. Change New Strike to **178.00** (above basis)

### What to see after changing to 178.00

| Field         | Expected                    |
| ------------- | --------------------------- |
| Amber warning | **Gone** — no warning shown |

5. Close the sheet without submitting.

---

## Scenario 7 — Validation: New Expiration Before Current

> **Story:** Trader accidentally enters an expiration earlier than the current CC expiration.

### Setup

Use the shared validation position in CC_OPEN state. Do not submit.

### Steps

1. Open the roll form
2. Enter: Cost to Close = 1.00, New Premium = 2.00
3. Set New Expiration = **Day +7** (before the current CC expiration of Day +21)
4. Click **"Confirm Roll"**

### Expected

| Field            | Expected                                                    |
| ---------------- | ----------------------------------------------------------- |
| Validation error | "New expiration must be on or after the current expiration" |
| Roll executed?   | **No** — form stays open, no legs created                   |

---

## Scenario 8 — Validation: No Change (Same Strike + Same Expiration)

> **Story:** Trader fills in the same strike and expiration as the current CC. The roll would
> be a no-op; the Confirm Roll button must be disabled.

### Setup

Use the shared validation position in CC_OPEN state.

### Steps

1. Open the roll form
2. The New Strike field is pre-filled with **182.00** (the current strike) — leave it
3. Set New Expiration = **Day +21** (the current CC expiration)
4. Observe the form — do NOT click Confirm Roll

### Expected

| Field                | Expected                                     |
| -------------------- | -------------------------------------------- |
| Eyebrow / roll badge | **No Change**                                |
| Confirm Roll button  | **Disabled** (greyed out, cannot be clicked) |
| Roll executed?       | **No** — button is not clickable             |

> **Key check:** Change New Expiration back to Day +42. The eyebrow should update away from
> "No Change" and the Confirm Roll button should become enabled again.

---

## Scenario 9 — Validation: Zero Cost to Close

> **Story:** Trader enters zero for Cost to Close. Validation must reject this.

### Setup

Use the shared validation position in CC_OPEN state.

### Steps

1. Open the roll form
2. Enter: Cost to Close = **0**, New Premium = 2.00, New Expiration = Day +42
3. Click **"Confirm Roll"**

### Expected

| Field            | Expected                                  |
| ---------------- | ----------------------------------------- |
| Validation error | "Cost to close must be greater than zero" |
| Roll executed?   | **No** — form stays open                  |

---

## Quick Reference: Cost Basis Math

| Starting state        | $/share     |
| --------------------- | ----------- |
| Assignment            | $180.00     |
| After CSP premium −$2 | $178.00     |
| After CC premium −$2  | **$176.00** |

| Roll outcome               | Net    | New basis       |
| -------------------------- | ------ | --------------- |
| Credit $1.00 (Sc. 1, 4)    | −$1.00 | $175.00         |
| Debit $0.50 (Sc. 2)        | +$0.50 | $176.50         |
| Credit $0.50 (Sc. 3, 5)    | −$0.50 | $175.50         |
| Below-basis strike (Sc. 6) | —      | Warning at $174 |
