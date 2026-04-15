# US-9 Manual Testing Plan — Record CC Expiring Worthless

## Scenario Overview

**Ticker:** AAPL
**Contracts:** 1 (controls 100 shares)
**Strategy:** Classic wheel — sell CSP, get assigned, sell CC, CC expires worthless, repeat

This scenario follows a realistic 0-DTE expiry on a weekly CC. The numbers are chosen so math
is easy to verify mentally.

---

## Scenario Setup

### Step 1 — Open a Cash-Secured Put (CSP)

| Field              | Value      |
| ------------------ | ---------- |
| Ticker             | AAPL       |
| Strike             | $180.00    |
| Contracts          | 1          |
| Premium / Contract | $3.50      |
| Expiration         | 2025-01-17 |

**Why these numbers:** $3.50 on a $180 strike is ~1.9% monthly yield — realistic for a
~25-delta put on a liquid large-cap. 30 DTE is the standard entry window for wheel traders.

**Expected result after save:**

- Phase: `CSP Open`
- Status: `Active`
- Leg recorded: `Sell Put · Jan 17, 2025`
- Premium / contract: `$3.50`

---

### Step 2 — Record Assignment

| Field           | Value      |
| --------------- | ---------- |
| Assignment Date | 2025-01-17 |

AAPL closed below $180 at Jan expiration. The put is assigned; you now own 100 shares at
$180/share.

**Expected result after confirm:**

- Phase: `Holding Shares`
- Status: `Active`
- Shares held: `100`
- Effective cost basis / share: **$176.50** = $180.00 − $3.50
- Total premium collected: `$350.00`

**Math check:**

```
Assignment strike:   $180.00
CSP premium:        −  $3.50
                    ────────
Cost basis / share:  $176.50
× 100 shares:       $17,650 total basis
```

---

### Step 3 — Open a Covered Call

| Field              | Value      |
| ------------------ | ---------- |
| Strike             | $182.00    |
| Contracts          | 1          |
| Premium / Contract | $2.30      |
| Expiration         | 2025-02-21 |
| Fill Date          | 2025-01-24 |

**Why $182 strike:** Above the $176.50 cost basis (avoids locking in a guaranteed loss if
called away) and above the $180 assignment price, giving upside on the shares too. The 28-DTE
window captures good theta decay. A $2.30 premium on $182 strike is ~1.3% yield — realistic
for a covered call on AAPL in moderate IV.

**Expected result after save:**

- Phase: `Sell Call`
- Leg recorded: `Sell Call · Feb 21, 2025`
- Premium / contract: `$2.30`
- **Updated cost basis / share: $174.20** = $176.50 − $2.30
- Total premium collected: **$580.00** = $350 + $230

**Math check:**

```
Prior basis / share: $176.50
CC premium:         −  $2.30
                    ────────
New basis / share:   $174.20
× 100 shares:       $17,420 total basis

Total premium:  $350 (CSP) + $230 (CC) = $580
```

---

### Step 4 — Record CC Expiring Worthless

AAPL closed at $181.50 on Feb 21, 2025 — below the $182 strike. The CC expires worthless;
you keep the full $230 premium and still hold 100 shares.

Navigate to the AAPL position detail. On Feb 21 (or after), the header should show:

> **Record Expiration →** ← this button only appears when DTE ≤ 0

Click **Record Expiration →** to open the expiration sheet.

#### Confirmation Sheet — Verify Before Confirming

| Element              | Expected                                          |
| -------------------- | ------------------------------------------------- |
| Header eyebrow       | `Record Expiration`                               |
| Header title         | `Expire Covered Call Worthless`                   |
| Header subtitle      | `AAPL Covered Call`                               |
| Phase transition row | `Call Open → Holding Shares` (as PhaseBadges)     |
| Leg recorded row     | `expire · no fill price`                          |
| Premium captured row | `AAPL · 1 × CALL $182.00 · Feb 21 · +$230 (100%)` |
| Warning              | `This cannot be undone.` visible                  |
| Footer buttons       | `Cancel` and `Confirm Expiration`                 |

Click **Confirm Expiration**.

---

## Expected Success State

### Sheet Success Screen

| Element                       | Expected Value                                             |
| ----------------------------- | ---------------------------------------------------------- |
| Header eyebrow                | `Complete` (green)                                         |
| Header title                  | `AAPL CC Expired Worthless`                                |
| Hero premium amount           | `+$230` (large, green)                                     |
| Hero sub-line                 | `100% premium captured · 1 contract`                       |
| Still Holding badge           | `100 shares of AAPL` (sky blue)                            |
| Result — Leg recorded         | `expire · Feb 21, 2026`                                    |
| Result — Phase                | `Holding Shares` (PhaseBadge)                              |
| Result — Shares still held    | `100`                                                      |
| Result — CC premium collected | `$230` (highlighted green row)                             |
| Strategic nudge               | contains `"1–3 days before selling the next covered call"` |
| CTA button                    | `Sell New Covered Call on AAPL →`                          |

### Position Detail After Closing Sheet

Click **Sell New Covered Call on AAPL →** (or **View full position history**) to dismiss the
sheet. On the position detail verify:

| Field                   | Expected Value                                                   |
| ----------------------- | ---------------------------------------------------------------- |
| Phase badge             | `Holding Shares`                                                 |
| Cost basis / share      | **$174.20** (unchanged from CC open — no new snapshot on expiry) |
| Total premium collected | **$580.00**                                                      |
| Leg history rows        | CSP Open, Assignment, CC Open, **Expire**                        |
| Expire leg: Role        | `Expired` (via `LEG_ROLE_LABEL`)                                 |
| Expire leg: Premium     | `$0.00`                                                          |
| Expire leg: Fill date   | `2025-02-21`                                                     |
| Closed date             | `null` — position is still active                                |
| Status                  | `Active`                                                         |

---

## Math Verification Summary

| Event                                 | Cost Basis / Share      | Total Premium        |
| ------------------------------------- | ----------------------- | -------------------- |
| Before CSP                            | —                       | —                    |
| After CSP open                        | —                       | —                    |
| After assignment at $180              | $176.50                 | $350                 |
| After CC open at $182 (premium $2.30) | **$174.20**             | **$580**             |
| After CC expires worthless            | **$174.20** ← no change | **$580** ← no change |

**Key insight:** The cost basis does NOT change on CC expiry (no new snapshot is created).
The premium was already captured when the CC was opened. Expiry just transitions the phase
back to Holding Shares so the trader can sell the next CC.

---

## Rejection Scenarios to Verify

### Reject: CC not yet expired (DTE > 0)

1. Open a new AAPL position in CSP, assign, then open a CC with expiration **30 days in
   the future**
2. On the position detail, verify the **Record Expiration →** button is **NOT visible**
3. The button should only appear when `DTE ≤ 0`

### Reject: Position not in CC_OPEN phase

1. Navigate to an AAPL position in **Holding Shares** phase (just assigned, no CC yet)
2. Verify the **Record Expiration →** button is **NOT visible**
3. Only `Open Covered Call →` should be in the header

---

## Notes

- **No fill price on the EXPIRE leg** is intentional — expiration events have no execution
  price. The leg records only the date and that it expired.
- **Cost basis does not change** on CC expiry because the premium snapshot was created when
  the CC was opened. The expiry just changes the phase, it does not adjust basis.
- **Sell New Covered Call CTA** closes the sheet and returns to the position detail, where the
  trader is now in Holding Shares and can open the next CC.
