# Interview Guide and Edge Cases Reference

Comprehensive question bank and failure mode catalog for the options-expert skill. Load this file when helping design user interviews, reviewing requirement completeness, or stress-testing product decisions.

---

## Interview Question Bank

### Opening Questions (Rapport and Workflow Discovery)

These questions establish the trader's experience level and actual workflow:

1. Walk me through the last wheel trade from the initial idea to the final exit. What tools did you use at each step?
2. How many active wheels do you typically run at once?
3. What is the first thing you check each morning about your open positions?
4. How do you decide a stock is suitable for wheeling? What disqualifies a stock?
5. Where do you track your positions today — broker platform, spreadsheet, journal, or something else?
6. What is the most frustrating part of managing wheel positions with your current tools?

### CSP Phase Questions

7. When you sell a put, what delta range do you target and why?
8. Do you have a standard DTE window, or does it vary by ticker?
9. How do you decide between two similar contracts at different strikes?
10. What is your premium yield floor — when is a put not worth selling?
11. Do you check earnings dates before opening a CSP? How far out do you look?
12. Have you ever been surprised by assignment? What happened?

### Assignment and Holding Phase Questions

13. When you get assigned, what is your first reaction and first action?
14. How quickly do you sell the first covered call after assignment — same day, next day, or do you wait?
15. Have you ever been assigned and immediately regretted it? What would have helped?
16. How do you decide if the thesis is still valid after assignment?
17. Do you track dividends received during the holding phase as part of your wheel return?

### Covered Call Phase Questions

18. How do you pick your CC strike — above cost basis, at a round number, at resistance, or something else?
19. When a CC is approaching ITM, at what point do you decide to roll versus accept call-away?
20. Have you ever rolled a CC and regretted it? What happened?
21. If the stock has risen well above your strike, do you prefer to be called away or roll up?
22. How do you handle ex-dividend dates when you have a short call open?

### Rolling Questions

23. What is your typical roll — same strike further out, or do you also adjust the strike?
24. Do you have a rule about when a roll must produce a net credit to be acceptable?
25. How many times have you rolled the same position before giving up?
26. What tells you that rolling is no longer the right move?
27. Have you ever rolled into earnings by accident?

### PMCC-Specific Questions

28. Why did you choose PMCC over a classic wheel for certain tickers?
29. How do you monitor whether your LEAPS has enough DTE remaining?
30. Have you ever had the short call get assigned on a PMCC? What happened?
31. How do you decide when to roll the LEAPS forward?
32. Do you manage PMCC and wheel positions differently in terms of attention or frequency?

### Alerts and Monitoring Questions

33. Which situations make you feel a position needs attention right now?
34. If the app could send you one alert per day, what would you most want it to be about?
35. What alerts would you trust enough to act on without opening your broker first?
36. What information must be in an alert to make it actionable rather than noisy?
37. How would you want multiple alerts on the same position prioritized?
38. Are there alerts you would want during market hours only versus after hours too?

### History and Journaling Questions

39. When you review a past wheel cycle, what matters more: income collected, total outcome, or decision quality?
40. How do you track whether rolling helped or just delayed a bad result?
41. What details do your current tools fail to preserve that you wish you had?
42. Do you annotate your trades with notes about why you made decisions?
43. How often do you review closed positions, and what are you looking for?

### Portfolio-Level Questions

44. How do you decide your total wheel allocation versus other strategies?
45. Do you track correlation between your active wheels?
46. What is the most positions you have managed at once, and where did it become hard?
47. How do you reserve buying power for rolls and new opportunities?

---

## Edge Cases and Failure Modes

### Market Events

**Gap down through CSP strike:**
- Stock drops 15-20% overnight (bad earnings, sector event, macro shock)
- Trader is assigned far below their expected entry
- Cost basis is still at strike minus premium, but unrealized loss is severe
- Covered calls above cost basis produce almost no premium
- **Product need:** "Impaired position" status or flag. Separate management workflow for positions significantly underwater (>10% below cost basis).

**Gap up through CC strike:**
- Stock jumps above the CC strike on good news
- Shares will be called away, capping profit
- Trader may want to roll up and out to capture more upside
- Decision is time-sensitive — must act before expiration
- **Product need:** Alert when underlying moves above CC strike by more than X%. Quick-action to roll.

**Flash crash / liquidity evaporation:**
- Option spreads widen dramatically during market stress
- Rolling becomes prohibitively expensive
- Limit orders may not fill
- **Product need:** Display bid-ask spread in management views. Warn when spread width exceeds a threshold (e.g., >$0.20 on a $2.00 option).

### Assignment-Related Edge Cases

**Early assignment on short call near ex-dividend:**
- Short call holders are at risk of early assignment when the dividend exceeds the call's remaining time value
- This can happen mid-cycle, not just at expiration
- For PMCC: early assignment creates a very dangerous situation if the short call is assigned and the long LEAPS doesn't fully cover
- **Product need:** Track ex-dividend dates for all underlying positions. Alert when a short call is near ITM approaching ex-dividend.

**Partial assignment:**
- On multi-contract positions, only some contracts may be assigned
- Creates a mixed state: some shares held, some contracts still open
- **Product need:** Handle partial assignment in the lifecycle engine. Allow a position to be partially in different phases.

**Assignment on a Friday after hours:**
- Options expiring ITM by $0.01 or more are automatically exercised
- Trader may not realize their option was ITM at the close
- **Product need:** Expiration-day monitoring that checks final prices and alerts if a position may be auto-exercised.

**Pin risk at expiration:**
- Stock closes very near the strike at expiration
- Trader doesn't know if they will be assigned or not until the following week
- **Product need:** Alert when a position is within 1% of strike on expiration day.

### PMCC-Specific Failures

**Short call assignment on PMCC:**
- If the short call is assigned, the trader must deliver 100 shares they don't own
- The long LEAPS can be exercised to acquire shares, but this closes the entire position
- If the LEAPS doesn't have enough intrinsic value, the trader takes a loss
- **Product need:** PMCC positions need a specific assignment workflow that models exercising the long leg to cover. This is structurally different from wheel assignment.

**LEAPS time decay acceleration:**
- LEAPS lose time value slowly at first, then accelerate inside 90 DTE
- A trader who doesn't roll the LEAPS in time loses significant extrinsic value
- **Product need:** Escalating alerts at 90, 60, and 45 DTE on the LEAPS leg.

**Stock drops below LEAPS strike:**
- The long LEAPS loses its intrinsic value cushion
- Delta drops, the synthetic stock coverage weakens
- Short call premium also drops, reducing income potential
- **Product need:** Alert when stock price approaches or drops below the LEAPS strike. The PMCC may need to be closed entirely.

### Operational Edge Cases

**Trader changes thesis mid-cycle:**
- Trader no longer wants to own the stock but has an open CSP
- Options: close the CSP (possibly at a loss), roll to a lower strike, or accept assignment and immediately sell shares
- **Product need:** "Close position" action available at any phase, with P&L impact preview.

**Liquidity deteriorates:**
- A previously liquid option chain becomes illiquid (low volume, wide spreads)
- Happens with smaller-cap stocks, or when a stock falls out of favor
- Rolling becomes expensive; closing becomes expensive
- **Product need:** Track open interest and volume trends. Warn if liquidity is declining on a position's option chain.

**Earnings surprise during open position:**
- Trader forgot to check earnings, or earnings date was moved
- IV crush after earnings can help (short options lose value fast) or hurt (gap through strike)
- **Product need:** Earnings calendar integration. Hard warning when earnings fall within the DTE window of any open position.

**Broker-specific behaviors:**
- Different brokers handle auto-exercise differently
- Some brokers charge exercise/assignment fees
- Paper trading may not simulate assignment realistically
- **Product need:** Document and surface broker-specific behavior differences where relevant.

### Portfolio-Level Failures

**Correlated drawdown:**
- 4 out of 5 wheels are in the same sector
- Sector rotation hits all positions simultaneously
- Capital is locked across multiple impaired positions
- **Product need:** Portfolio correlation view. Warning when opening a new wheel that is highly correlated with existing positions.

**Over-allocation:**
- Trader opens too many wheels, leaving no reserve buying power
- Cannot roll positions because there is no free capital for margin requirements
- **Product need:** Buying power utilization display. Warning when allocation exceeds a configurable threshold (e.g., 80% of buying power deployed).

**Roll cascade:**
- Multiple positions need rolling in the same week
- Trader becomes overwhelmed and makes hasty decisions
- **Product need:** Management queue with prioritization. Calendar view of upcoming expirations to prevent clustering.

---

## Requirement Patterns to Extract

When using this reference to help with requirements, map edge cases to these categories:

1. **Data capture:** What must be recorded when this event occurs?
2. **State transition:** How does the lifecycle phase change?
3. **Cost basis impact:** How does the event change the effective cost basis?
4. **Alert/notification:** Should this trigger a management queue item?
5. **User decision:** What information does the user need to make the right call?
6. **Validation:** What constraints should the app enforce to prevent errors?
7. **History/audit:** What needs to be preserved for later review?
