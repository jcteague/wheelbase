# Strategy Mechanics Reference

Deep domain knowledge for the options-expert skill. Load this file when the conversation involves strategy lifecycle, roll mechanics, cost basis math, or PMCC-specific logic.

---

## Classic Wheel Lifecycle in Detail

### Phase 1: Sell Cash-Secured Put (CSP)

The trader selects an underlying they are willing to own at the strike price. "Willing to own" is not hypothetical — it means the trader has evaluated the company and would be comfortable holding shares through a drawdown.

**Contract selection trade-offs:**

| Variable               | Conservative         | Moderate           | Aggressive            |
| ---------------------- | -------------------- | ------------------ | --------------------- |
| Delta                  | 0.15-0.20            | 0.20-0.30          | 0.30-0.40             |
| DTE                    | 30-45                | 30-45              | 20-30                 |
| Premium yield          | Lower (~0.8-1.2%/mo) | Mid (~1.2-2.0%/mo) | Higher (~2.0-3.5%/mo) |
| Assignment probability | ~15-20%              | ~20-30%            | ~30-40%               |

Delta is a rough proxy for assignment probability but not exact. Actual probability depends on the underlying's realized volatility and drift.

**Capital requirement:** Strike x 100 x contracts. A $50 strike put on 1 contract locks up $5,000 in buying power. This capital is unavailable for other trades until the put expires or is closed.

**Expiration outcomes:**

- Expires OTM: Full premium kept, capital freed, cycle restarts
- Approaches ITM: Decision point — roll or accept assignment
- Assigned: Shares delivered at strike price, cost basis adjusted by premium received

### Phase 2: Holding Shares (Post-Assignment)

Assignment changes the trader's mental frame. They now own stock and must manage equity risk, not just option premium risk.

**Immediate decisions after assignment:**

1. Is the thesis still valid? Has anything changed about the underlying?
2. Where is the stock relative to the effective cost basis?
3. When to sell the first covered call?

**Common mistake:** Selling the first CC immediately after assignment without waiting for a bounce. If the stock was put to the trader because it fell, selling a CC at the current depressed price locks in a low strike. Many traders wait 1-3 days to see if there's a relief bounce before establishing the CC.

**Dividend considerations:** If the stock pays dividends, the trader now collects them. This is a real benefit during the holding phase and should be tracked as part of total return.

### Phase 3: Sell Covered Call (CC)

The trader sells calls against held shares. The primary constraint: the CC strike should be at or above the effective cost basis to avoid locking in a guaranteed loss if called away.

**Strike selection logic:**

- **Above cost basis (required):** Ensures any call-away produces a profit or breakeven
- **Near resistance levels:** Technical traders pick strikes at prior resistance
- **Target yield:** Many wheel traders target a specific monthly premium yield (1-2% of stock value)
- **Delta 0.20-0.35:** Similar probability range as the CSP phase

**Expiration outcomes:**

- Expires OTM: Premium kept, shares retained, sell another CC
- Called away: Shares sold at strike, profit = (strike - cost basis) + all premiums collected
- Approaches ITM: Decision point — roll, close, or accept call-away

### Phase 4: Repeat or Exit

After call-away, the trader has completed one full wheel cycle. They assess:

- Was the annualized return acceptable?
- Is the underlying still a good wheel candidate?
- Has IV changed enough to make the wheel less attractive?

---

## Roll Mechanics

Rolling is the most frequent management action and the most poorly understood by new traders. A roll is always two transactions executed as close together as possible:

1. **Buy to close** the existing short option (debit)
2. **Sell to open** a new short option (credit)

The net of these two is either a credit (desirable) or a debit (sometimes necessary).

### Roll Types

**Roll out (same strike, later expiration):**

- Most common roll type
- Almost always produces a net credit because the new expiration has more time value
- Used when the trader wants to keep the same strike but needs more time
- Example: Roll the $50 put from March to April expiration

**Roll down and out (lower strike, later expiration):**

- Used when the underlying has moved against the CSP
- Lower strike reduces assignment risk but also reduces premium
- The "out" component (more DTE) helps offset the reduced premium from the lower strike
- Example: Roll from the $50 March put to the $47 April put

**Roll up and out (higher strike, later expiration):**

- Used for covered calls when the stock has risen
- Higher strike gives more room before call-away
- Common when the trader wants to keep shares longer
- Example: Roll the $55 March call to the $58 April call

**Roll down (same expiration, lower strike) / Roll up (same expiration, higher strike):**

- Less common because same-expiration rolls often produce a debit
- Used only in specific tactical situations

### Roll Decision Framework

Traders evaluate rolls on these criteria:

1. **Net credit or debit?** Strongly prefer rolls that produce a net credit
2. **Does the new position improve the probability of profit?** Lower delta = higher probability
3. **Is the underlying still a good wheel candidate?** Rolling a deteriorating position just delays a loss
4. **How many times has this been rolled?** Serial rolling (3+ times) on the same position is a warning sign
5. **Opportunity cost:** Is the capital better deployed elsewhere?

### When NOT to Roll

- The underlying has had a fundamental thesis change (earnings disaster, sector collapse)
- The roll would produce a large net debit that wipes out prior premium
- The position has been rolled 3+ times and keeps deteriorating
- Better opportunities exist for the capital

---

## PMCC (Poor Man's Covered Call) Mechanics

### Structure

A PMCC is a diagonal spread used as a capital-efficient substitute for a covered call position:

- **Long leg:** Buy a deep ITM LEAPS call (delta 0.70-0.85, 180-500 DTE)
- **Short leg:** Sell an OTM near-term call (delta 0.25-0.35, 20-45 DTE)

The long LEAPS acts as a synthetic stock position. The short call generates recurring income that reduces the LEAPS cost basis over time.

### Capital Efficiency

Classic wheel on a $100 stock: $10,000 cash required per contract
PMCC on the same stock: ~$3,000-$5,000 net debit (LEAPS cost minus short call credit)

This is the primary appeal — similar income generation with 50-70% less capital deployed.

### Critical Safety Constraints

1. **Long DTE must always exceed short DTE.** If the short call expires after the long call, the trader has a naked short call — unlimited risk.
2. **Net debit should be less than 75% of spread width.** Example: On a $10-wide diagonal, the net debit should be under $7.50.
3. **Long call must maintain high delta.** If the stock drops and the LEAPS delta falls below 0.60, the synthetic coverage is weakening.

### PMCC-Specific Roll Scenarios

**Rolling the short call (routine, every 20-45 days):**

- Same as a CC roll — buy to close, sell to open a new short call
- Always verify the new short call expires before the LEAPS

**Rolling the LEAPS (periodic, when DTE drops below 60-90):**

- Buy to close current LEAPS, sell to open a new LEAPS further out
- This is the more expensive roll — LEAPS have significant time value
- Traders may also roll up in strike if the stock has appreciated
- The net debit of the LEAPS roll should be partially offset by accumulated short call credits

### PMCC Cost Basis

```
leaps_cost_basis = initial_leaps_debit
                 - all_short_call_premiums_collected
                 + all_roll_debits_paid
                 - all_roll_credits_received

Goal: Reduce leaps_cost_basis to zero or negative (free position)
```

### Where PMCC and Wheel Diverge in the App

| Concern            | Classic Wheel              | PMCC                                                 |
| ------------------ | -------------------------- | ---------------------------------------------------- |
| Entry capital      | Strike x 100 x contracts   | Net debit of diagonal                                |
| Phase model        | CSP -> Holding -> CC       | Long LEAPS + Short Call (no holding phase)           |
| Assignment risk    | On CSP or CC               | Only on short call (creates naked risk)              |
| Cost basis formula | Based on assignment strike | Based on LEAPS debit                                 |
| Roll frequency     | Short leg every 20-45 days | Short leg every 20-45 days + LEAPS every 6-12 months |
| Max loss           | Stock to zero              | Net debit paid                                       |
| Dividend income    | Yes, during holding phase  | No (no shares owned)                                 |

---

## Cost Basis Math — Worked Examples

### Classic Wheel Example

1. **Sell CSP:** $50 strike, $2.00 premium, 1 contract
   - Capital locked: $5,000
   - Premium received: $200
   - Effective basis if assigned: $50 - $2 = $48/share

2. **Assigned at $50.** Stock now at $47.
   - Cost basis: $48/share
   - Unrealized loss: ($47 - $48) x 100 = -$100
   - But premium already collected offsets what would have been a -$300 loss

3. **Sell CC:** $50 strike, $1.50 premium
   - New cost basis: $48 - $1.50 = $46.50/share
   - Breakeven has moved down to $46.50

4. **CC expires worthless.** Stock at $49.
   - Total premium collected: $200 + $150 = $350
   - Sell another CC: $51 strike, $1.00 premium
   - New cost basis: $46.50 - $1.00 = $45.50/share

5. **Called away at $51.**
   - Stock profit: ($51 - $48) x 100 = $300 (from assignment price)
   - Total premium: $200 + $150 + $100 = $450
   - Total profit: $300 + $450 = $750 on $5,000 deployed

### PMCC Example

1. **Buy LEAPS:** $80 strike call, 365 DTE, $25.00 debit (stock at $100)
2. **Sell short call:** $105 strike, 30 DTE, $2.50 credit
   - Net debit: $25.00 - $2.50 = $22.50
   - Spread width: $105 - $80 = $25
   - Debit/width ratio: $22.50/$25 = 90% (slightly above the 75% target but acceptable)

3. **Short call expires worthless.** Sell another: $107 strike, $2.00 credit
   - Running cost basis: $22.50 - $2.00 = $20.50

4. After 6 rounds of short calls averaging $2.00 each:
   - Total short call income: $12.00
   - Running cost basis: $25.00 - $12.00 = $13.00
   - Position is not yet "free" but has significant premium cushion
