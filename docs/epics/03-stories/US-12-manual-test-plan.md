# Manual Test Plan: Roll Open CSP Out (US-12)

## How to Read This Plan

**Day 0** = today's date. Substitute real calendar dates when running the test.
**Day +N** = N calendar days after today.

Use the app's actual date picker for all dates. All math is decimal; verify with a phone calculator.

---

## Setup (shared across all scenarios)

Create the starting position once, then use it for Scenario 1. Scenarios 2-5 each need their own fresh position.

| Step | Screen | Field | Value |
|------|--------|-------|-------|
| 1 | New Wheel | Ticker | AAPL |
| 1 | New Wheel | CSP Strike | 180.00 |
| 1 | New Wheel | Contracts | 1 |
| 1 | New Wheel | Premium / Contract | 3.50 |
| 1 | New Wheel | Expiration | Day +30 |

### After creation — verify position detail

| Field | Expected |
|-------|----------|
| Phase badge | CSP_OPEN |
| Status | ACTIVE |
| Strike | $180.00 |
| Expiration | Day +30 |
| Premium collected | $350.00 |
| Cost basis | $176.50/share |
| Action buttons visible | "Roll CSP →" present |

---

## Scenario 1 — Net Credit Roll Out (Happy Path)

> **Story:** AAPL is flat near $180. The trader's CSP is approaching expiration. They roll out to a later date, collecting a net credit of $1.60/contract.

### Step 1: Open the roll form

Click **"Roll CSP →"** button on the position detail page.

### Roll form — what to see

| Field | Expected |
|-------|----------|
| Sheet title | "Roll Cash-Secured Put" |
| Eyebrow label | "Roll Out" |
| Current Leg > Strike | $180.00 |
| Current Leg > Expiration | Day +30 (with DTE count) |
| Current Leg > Premium collected | +$3.50/contract ($350.00) |
| Current Leg > Cost basis | $176.50/share (gold highlight) |
| New Strike field | Pre-filled with 180.00 |
| New Expiration field | Empty |
| Cost to Close field | Empty |
| New Premium field | Empty |
| Fill Date field | Empty |

### Step 2: Enter roll values

| Field | Value |
|-------|-------|
| Cost to Close | 1.20 |
| New Premium | 2.80 |
| New Expiration | Day +60 |

### Net credit/debit preview — what to see

| Field | Expected |
|-------|----------|
| Label | "Net Credit" |
| Amount | +$1.60/contract |
| Total | ($160.00 total) |
| Color | **Green** |
| Warning | None |

### Math — verify before clicking Confirm

```
netCredit  =  newPremium − costToClose
           =  2.80 − 1.20
           =  $1.60/contract

total      =  1.60 × 1 contract × 100  =  $160.00

newBasisPerShare  =  prevBasis − netCredit
                  =  176.50 − 1.60
                  =  $174.90

newTotalPremium   =  prevTotal + (newPremium − costToClose) × 1 × 100
                  =  350.00 + 160.00
                  =  $510.00
```

### Step 3: Confirm the roll

Click **"Confirm Roll"**.

### Success screen — what to see

| Field | Expected |
|-------|----------|
| Header caption | "Roll Complete" (green text) |
| Title | "CSP Rolled Successfully" |
| Subtitle | AAPL PUT $180.00 → PUT $180.00 · Day +60 |
| Hero label | "ROLL NET CREDIT" |
| Hero amount | **+$1.60** (green, large) |
| Hero total | $160.00 total · 1 contract |
| Roll type | Roll Out |
| Old leg | ROLL_FROM · BUY PUT $180.00 @ $1.20 |
| New leg | ROLL_TO · SELL PUT $180.00 @ $2.80 |
| New expiration | Day +60 (with DTE) |
| Roll chain ID | 8-char UUID prefix |
| Phase | CSP_OPEN (unchanged) |
| Cost basis | $176.50 → $174.90/share (gold highlight) |
| Info box | "New CSP expires Day +60 ... Your cost basis improved by $1.60/share" |

### Step 4: Close the sheet and verify position detail

Close the success sheet (× button).

| Field | Expected |
|-------|----------|
| Phase badge | CSP_OPEN (unchanged) |
| Strike | $180.00 |
| Expiration | **Day +60** (updated) |
| Cost basis | **$174.90/share** |
| Premium collected | **$510.00** |
| Leg history | 3 legs: CSP_OPEN, ROLL_FROM, ROLL_TO |
| "Roll CSP →" button | Still visible |

---

## Scenario 2 — Net Debit Roll Out

> **Story:** AAPL moved against the trader. Buying back the CSP costs more than the new premium. The trader rolls out anyway to buy time, accepting a net debit.

### Setup

Create a new AAPL position with the same setup values as above.

### Step 1: Open the roll form and enter values

| Field | Value |
|-------|-------|
| Cost to Close | 3.00 |
| New Premium | 2.50 |
| New Expiration | Day +60 |

### Net debit preview — what to see

| Field | Expected |
|-------|----------|
| Label | "Net Debit" |
| Amount | -$0.50/contract |
| Total | ($50.00 total) |
| Color | **Amber/gold** (not green) |
| Warning | "This roll costs more to close than the new premium provides" |

### Math

```
netDebit    =  costToClose − newPremium
            =  3.00 − 2.50
            =  $0.50/contract

total       =  0.50 × 1 × 100  =  $50.00

newBasis    =  176.50 + 0.50  =  $177.00/share   ← basis increases on debit
newPremium  =  350.00 − 50.00  =  $300.00
```

### Step 2: Confirm the roll

### Success screen — what to see

| Field | Expected |
|-------|----------|
| Hero label | "ROLL NET DEBIT" |
| Hero amount | **-$0.50** (**gold/amber**, not green) |
| Hero total | $50.00 total · 1 contract |
| Header border | Gold/amber (not green) |
| "Roll Complete" text | Gold/amber color |
| Cost basis | $176.50 → **$177.00/share** (basis went up) |
| Info box | "...Your cost basis changed by $0.50/share" (says "changed", not "improved") |

> **Key check:** Every green element in Scenario 1's success screen should be gold/amber here. Specifically: hero amount, hero label, hero total line, "Roll Complete" caption, header border, and hero card background/border.

---

## Scenario 3 — Roll After Roll (Sequential Rolls)

> **Story:** After the first roll, the trader rolls again to an even later date. This tests that the second roll correctly reads the ROLL_TO leg from the first roll as the current active leg.

### Prerequisite

Complete Scenario 1 first (position has been rolled once to Day +60 at $180 strike).

### Step 1: Open the roll form again

Click **"Roll CSP →"** on the same position.

### Roll form — verify current leg shows the ROLL_TO data

| Field | Expected |
|-------|----------|
| Current Leg > Strike | **$180.00** (from ROLL_TO) |
| Current Leg > Expiration | **Day +60** (from ROLL_TO, not the original Day +30) |
| Current Leg > Cost basis | **$174.90/share** |
| New Strike | Pre-filled with **180.00** |

> **Key check:** If the form shows the original expiration (Day +30) instead of Day +60, the active leg bug (#1) is still present.

### Step 2: Enter second roll values

| Field | Value |
|-------|-------|
| Cost to Close | 0.80 |
| New Premium | 2.00 |
| New Expiration | Day +90 |

### Math

```
netCredit  =  2.00 − 0.80  =  $1.20/contract
total      =  1.20 × 100   =  $120.00

newBasis   =  174.90 − 1.20  =  $173.70/share
newPremium =  510.00 + 120.00  =  $630.00
```

### Step 3: Confirm and verify success screen

| Field | Expected |
|-------|----------|
| Hero amount | **+$1.20** (green) |
| Old leg | ROLL_FROM · BUY PUT **$180.00** @ $0.80 |
| New leg | ROLL_TO · SELL PUT $180.00 @ $2.00 |
| New expiration | Day +90 |
| Cost basis | $174.90 → **$173.70/share** |

### Step 4: Close sheet and verify position detail

| Field | Expected |
|-------|----------|
| Strike | $180.00 |
| Expiration | **Day +90** |
| Cost basis | **$173.70/share** |
| Premium collected | **$630.00** |
| Leg history | 5 legs: CSP_OPEN, ROLL_FROM, ROLL_TO, ROLL_FROM, ROLL_TO |

---

## Scenario 4 — Validation: Expiration Before Current

> **Story:** Trader accidentally enters an expiration date that's before the current leg's expiration.

### Setup

Create a new AAPL position with the standard setup values.

### Steps

1. Open the roll form
2. Enter: Cost to Close = 1.20, New Premium = 2.80
3. Enter New Expiration = **Day +20** (before the current expiration of Day +30)
4. Click **"Confirm Roll"**

### Expected

| Field | Expected |
|-------|----------|
| Validation error | "New expiration must be after the current expiration" |
| Roll executed? | **No** — form stays open, no legs created |

---

## Scenario 5 — Validation: Empty/Zero Fields

> **Story:** Trader submits the form with missing or zero values.

### Setup

Create a new AAPL position with the standard setup values.

### Test 5a: Submit with all fields empty

1. Open the roll form
2. Click **"Confirm Roll"** immediately

| Field | Expected |
|-------|----------|
| Cost to Close error | "Cost to close must be greater than zero" |
| New Premium error | "New premium must be greater than zero" |
| Expiration error | "New expiration must be after the current expiration" |

### Test 5b: Submit with strike field cleared

1. Open the roll form
2. **Clear** the New Strike field (select all, delete)
3. Enter: Cost to Close = 1.20, New Premium = 2.80, New Expiration = Day +60
4. Click **"Confirm Roll"**

| Field | Expected |
|-------|----------|
| Strike error | "Strike must be greater than zero" |
| Roll executed? | **No** — mutate not called, no NaN submitted |

> **Key check:** The app must NOT submit the form with NaN. If a generic/unclear validation error appears instead of the strike-specific message, bug #6 is still present.

---

## Scenario 6 — Validation: Wrong Phase

> **Story:** Trader navigates to a position that is not in CSP_OPEN phase. The roll button must not be available.

### Steps

1. Create a new AAPL position (standard setup)
2. Record Assignment (position moves to HOLDING_SHARES)
3. View position detail

### Expected

| Field | Expected |
|-------|----------|
| Phase badge | HOLDING_SHARES |
| "Roll CSP →" button | **Not visible** |
| Available actions | "Open Covered Call →" only |
