# Manual Test Plan: Record Shares Called Away (US-10)

## How to Read This Plan

**Day 0** = today's date. Substitute real calendar dates when running the test.
**Day +N** = N calendar days after today.

Use the app's actual date picker for all dates. All math is decimal; verify with a phone calculator.

---

## Scenario 1 — Standard Profitable Call-Away

> **Story:** Stock stayed strong. Trader sold a CSP, got assigned, sold a covered call at a higher strike, and now it's being called away at a profit.

### Inputs

| Step | Screen            | Field                 | Value   |
| ---- | ----------------- | --------------------- | ------- |
| 1    | New Wheel         | Ticker                | AAPL    |
| 1    | New Wheel         | CSP Strike            | 100.00  |
| 1    | New Wheel         | Contracts             | 1       |
| 1    | New Wheel         | Premium / Contract    | 5.00    |
| 1    | New Wheel         | Expiration            | Day +30 |
| 2    | Record Assignment | Assignment Date       | Day 0   |
| 3    | Open Covered Call | CC Strike             | 100.00  |
| 3    | Open Covered Call | CC Premium / Contract | 3.00    |
| 3    | Open Covered Call | CC Fill Date          | Day 0   |
| 3    | Open Covered Call | CC Expiration         | Day +30 |

### Math — verify each line before clicking Confirm

```
basisPerShare  =  CSP_strike  −  CSP_prem  −  CC_prem
               =  100.00      −  5.00      −  3.00
               =  $92.00

sharesHeld     =  1 contract × 100  =  100 shares

Appreciation/share  =  CC_strike  −  basisPerShare
                    =  100.00     −  92.00
                    =  $8.00

Final P&L  =  $8.00 × 100  =  +$800.00

capitalDeployed  =  $92.00 × 100  =  $9,200.00

cycleDays  =  Day +30  −  Day 0  =  30 days

annualizedReturn  =  (800 / 9200) × (365 / 30) × 100
                  =  0.08696 × 12.167 × 100
                  ≈  105.8%
```

### Confirmation Form — what to see

| Row             | Label                        | Expected                 |
| --------------- | ---------------------------- | ------------------------ |
| Waterfall       | CC strike (shares delivered) | $100.00                  |
| Waterfall       | − Effective cost basis       | $92.00                   |
| Waterfall       | = Appreciation per share     | $8.00                    |
| Waterfall       | × 100 shares                 | $800.00                  |
| Waterfall       | = Final cycle P&L            | **+$800.00** (green)     |
| Fill Date field | Derived, read-only           | Day +30                  |
| Fill Date label |                              | "auto"                   |
| Warning         |                              | "This cannot be undone." |

### Success Screen — what to see

| Field             | Expected                    |
| ----------------- | --------------------------- |
| Header caption    | "Wheel Complete"            |
| Hero title        | "WHEEL COMPLETE"            |
| Hero P&L          | **+$800.00** (green)        |
| Leg recorded      | "cc_close · Day +30"        |
| Shares delivered  | "100 @ $100.00"             |
| Cycle duration    | "30 days"                   |
| Annualized return | **~105.8%**                 |
| CTA button        | "Start New Wheel on AAPL →" |

### Position detail (behind the sheet)

| Field                           | Expected       |
| ------------------------------- | -------------- |
| Phase                           | WHEEL_COMPLETE |
| Leg history action              | EXERCISE       |
| Final P&L in cost basis section | $800.00        |

---

## Scenario 2 — Loss Call-Away (Below Cost Basis)

> **Story:** Stock dropped after assignment. Trader sold a CC below their cost basis to start recovering capital. Stock was called away at a loss. Red P&L throughout.

### Inputs

| Step | Screen            | Field                 | Value   |
| ---- | ----------------- | --------------------- | ------- |
| 1    | New Wheel         | Ticker                | AAPL    |
| 1    | New Wheel         | CSP Strike            | 100.00  |
| 1    | New Wheel         | Contracts             | 1       |
| 1    | New Wheel         | Premium / Contract    | 2.00    |
| 1    | New Wheel         | Expiration            | Day +30 |
| 2    | Record Assignment | Assignment Date       | Day 0   |
| 3    | Open Covered Call | CC Strike             | 95.00   |
| 3    | Open Covered Call | CC Premium / Contract | 1.00    |
| 3    | Open Covered Call | CC Fill Date          | Day 0   |
| 3    | Open Covered Call | CC Expiration         | Day +30 |

### Math

```
basisPerShare  =  100.00 − 2.00 − 1.00  =  $97.00

Appreciation/share  =  95.00 − 97.00  =  −$2.00  ← negative

Final P&L  =  −$2.00 × 100  =  −$200.00

capitalDeployed  =  $97.00 × 100  =  $9,700.00

cycleDays  =  30 days

annualizedReturn  =  (−200 / 9700) × (365 / 30) × 100
                  =  −0.02062 × 12.167 × 100
                  ≈  −25.1%
```

### Confirmation Form — what to see

| Row       | Label                        | Expected           |
| --------- | ---------------------------- | ------------------ |
| Waterfall | CC strike (shares delivered) | $95.00             |
| Waterfall | − Effective cost basis       | $97.00             |
| Waterfall | = Appreciation per share     | **−$2.00**         |
| Waterfall | × 100 shares                 | $200.00            |
| Waterfall | = Final cycle P&L            | **−$200.00 (red)** |

### Success Screen — what to see

| Field             | Expected           |
| ----------------- | ------------------ |
| Hero P&L          | **−$200.00 (red)** |
| Annualized return | **~−25.1%**        |

> **Key check:** The P&L display uses a unicode minus **−** (not a hyphen) and the color is `var(--wb-red)`. Confirm the number is visually distinct from the green profit case.

---

## Scenario 3 — 0DTE (Same-Day Expiration)

> **Story:** Trader opens a covered call expiring the same day (0DTE). Stock closes above strike. Called away same day.

This scenario specifically tests that 0DTE is supported — the app previously rejected same-day expiration with "Expiration date has already passed".

### Inputs

| Step | Screen            | Field                 | Value                |
| ---- | ----------------- | --------------------- | -------------------- |
| 1    | New Wheel         | Ticker                | AAPL                 |
| 1    | New Wheel         | CSP Strike            | 100.00               |
| 1    | New Wheel         | Contracts             | 1                    |
| 1    | New Wheel         | Premium / Contract    | 4.00                 |
| 1    | New Wheel         | Expiration            | Day +30              |
| 2    | Record Assignment | Assignment Date       | Day 0                |
| 3    | Open Covered Call | CC Strike             | 102.00               |
| 3    | Open Covered Call | CC Premium / Contract | 2.00                 |
| 3    | Open Covered Call | CC Fill Date          | **Day 0**            |
| 3    | Open Covered Call | CC Expiration         | **Day 0** ← same day |

### Math

```
basisPerShare  =  100.00 − 4.00 − 2.00  =  $94.00

Final P&L  =  (102.00 − 94.00) × 100  =  +$800.00

capitalDeployed  =  $94.00 × 100  =  $9,400.00

cycleDays  =  Day 0 − Day 0  =  0 days
             (position opened same day as call-away)

annualizedReturn  =  "0.0000"  ← division-by-zero guard
```

### Confirmation Form — what to see

| Row             | Expected             |
| --------------- | -------------------- |
| Fill Date       | **Day 0** (today)    |
| Final cycle P&L | **+$800.00** (green) |

### Success Screen — what to see

| Field             | Expected   |
| ----------------- | ---------- |
| Cycle duration    | **0 days** |
| Annualized return | **~0.0%**  |

> **Key check:** The app must not crash or show `NaN%` when cycleDays is zero. `~0.0%` is the correct display.

---

## Scenario 4 — Validation Gate: Wrong Phase

> **Story:** Trader navigates to a position in HOLDING_SHARES and tries to record a call-away. The button must not be present.

### Steps

1. Open a CSP position (any values)
2. Record Assignment
3. **Stop here — do not open a CC**
4. View position detail

### Expected

- `Record Call-Away →` button is **not visible**
- Only `Open Covered Call →` button is visible
- No way to reach the call-away sheet from this state
