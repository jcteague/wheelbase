# Trader Reality Reference

How wheel and PMCC traders actually behave, think, and struggle. Load this file when the conversation involves user psychology, workflow pain points, current tooling gaps, or the difference between textbook strategy and real-world execution.

---

## Behavioral Patterns Under Pressure

### Loss Aversion and the "Bag Holder" Problem

The single biggest risk in the wheel strategy is not assignment itself — it is the trader's psychological response to holding shares that have dropped well below their cost basis.

**What happens:**
1. Trader sells a CSP on a stock at $50 with a $48 effective basis
2. Stock drops to $35 on bad earnings
3. Trader is assigned: owns shares at $48 effective cost, stock now at $35
4. Covered calls at or above $48 generate almost no premium (too far OTM)
5. Trader either sells CC at $40 (locking in a loss if called away) or holds and waits

**The behavioral trap:** Traders anchor to their cost basis and refuse to sell CCs below it, even when the position is clearly impaired. They become passive bag holders waiting for recovery rather than actively managing the position. This can tie up capital for months or years.

**Product implication:** Wheelbase should track the duration a position has been underwater and surface prompts like "This position has been below cost basis for 60 days. Consider whether the capital is better deployed elsewhere."

### Rolling as Denial

Experienced traders know that rolling is a management tool, not a rescue operation. But under pressure, rolling becomes a way to avoid realizing a loss:

- Rolling a losing CSP down and out repeatedly, collecting small credits that barely offset the accumulating unrealized loss
- Telling themselves "I'm still collecting premium" while the underlying continues to deteriorate
- Each roll extends the timeline and deepens the capital lock-up

**What traders say:** "I'll just keep rolling for credit until it comes back."
**What actually happens:** The trader has turned a 30-day trade into a 6-month ordeal with a worse risk-adjusted return than simply taking the loss early.

**Product implication:** Track roll count per position. Surface a warning after the 3rd roll: "This position has been rolled 3 times. Total net credits from rolls: $X. Current unrealized loss: $Y. Consider whether continued rolling improves expected outcome."

### Anchoring to Strike Price

Traders anchor to their original strike selection even when market conditions have changed:
- Selling CCs at the same strike repeatedly even though volatility has shifted
- Refusing to lower CC strikes because "I should be able to get that price"
- Fixating on a specific DTE window even when term structure favors a different expiration

### Overconfidence After a Winning Streak

After 5-10 successful wheel cycles, traders often:
- Increase position size too aggressively
- Move to higher-delta (more aggressive) strikes
- Wheel stocks they haven't properly researched because "the strategy works"
- Underestimate tail risk because they haven't experienced a sharp drawdown yet

### The "Just One More Roll" Bias

When a CC is about to be assigned and the trader likes the stock, they roll the call up and out to avoid call-away. This can be rational, but it's often driven by an emotional reluctance to let shares go, even when call-away would realize a profit.

---

## How Traders Currently Manage Wheels (Without Wheelbase)

### Spreadsheets (Most Common)

The dominant tool for wheel tracking is a personal spreadsheet. Common patterns:

- Google Sheets or Excel with one row per leg
- Manual entry of open/close prices, premiums, dates
- Cost basis formulas that break when rolls are added
- No automated alerts — trader checks the sheet and their broker separately
- History is fragile: rows get deleted, formulas break, sheets get messy over time

**Pain points traders report:**
- "I can never remember my exact cost basis after 3 rolls"
- "I have to check my broker for current prices, then update my sheet"
- "I forgot to update my spreadsheet and now I can't reconstruct what happened"
- "Rolling breaks my formulas every time"

### Broker Platforms (ThinkOrSwim, Tastyworks, Schwab)

Broker platforms show current positions but are poor wheel management tools:
- No concept of a "wheel" as a multi-leg lifecycle
- Cost basis shown is tax cost basis, not the trader's effective premium-adjusted basis
- Roll history is buried in transaction logs, not linked to the position
- No alerts specific to wheel management (approaching cost basis, roll windows)
- Closed positions disappear from the active view

**Pain points traders report:**
- "My broker shows my cost basis but it doesn't include the put premium I collected"
- "I can't see my full wheel history in one place"
- "When I roll, the old position just disappears — I lose the context"
- "I have to manually track which covered calls go with which assignment"

### Trading Journals (TraderVue, Edgewonk)

Some traders use journaling tools, but these are designed for directional trading, not income strategies:
- Focus on entry/exit P&L, not ongoing premium collection
- No lifecycle concept for multi-leg strategies
- Don't model rolls as linked pairs
- Cost basis calculation doesn't account for premium reduction

### TradingView and Options Analytics Tools

Used for chart analysis and screening but not position management:
- Good for finding wheel candidates (high IV, liquid options)
- No tracking of open positions
- No cost basis or premium tracking
- No alert integration with position state

---

## Decision-Making Patterns at Key Moments

### Before Opening a New Wheel

**What experts check (in rough order):**
1. Thesis: Would I own this stock for 3-6 months?
2. IV rank: Is premium rich enough to make the wheel worthwhile?
3. Earnings: Am I selling into an earnings event?
4. Chart: Is there obvious support near my target strike?
5. Liquidity: Are the bid-ask spreads tight enough?
6. Capital: Does this position fit within my allocation rules?
7. Correlation: Am I already running wheels on correlated tickers?

**What beginners skip:** Items 4-7, especially correlation. A common mistake is running 5 wheels on tech stocks, which creates concentrated sector risk.

### At the 50% Profit Mark

This is the most debated management point in the wheel community:
- **Close at 50%:** Lock in profit, free capital, redeploy. Mathematically optimal for premium sellers because the last 50% of premium decays the slowest.
- **Let it run:** Keep the remaining premium. Risk is that the underlying reverses.
- **Personal preference:** Some traders use 25% on high-IV names (take profit quickly), 65-75% on low-IV names (need the extra premium).

**Product implication:** The 50% target should be a per-position configurable preference, not a hard-coded global.

### At the 21-DTE Mark

Standard management window for rolling:
- Theta decay accelerates inside 21 DTE but so does gamma risk
- Most traders either close profitable positions or roll if the position is challenged
- Some traders use 14 DTE instead

### Assignment Day

**Emotional reactions traders report:**
- Relief ("finally, now I can sell calls")
- Anxiety ("the stock is below my cost basis, am I trapped?")
- Confusion ("how do I calculate my new cost basis?")
- Regret ("I should have rolled instead of accepting assignment")

**What the app should do:** Surface the assignment clearly, show the adjusted cost basis, and present the next action (sell CC) with pre-filtered candidates above the cost basis.

---

## Position Sizing and Portfolio-Level Concerns

### Common Allocation Rules

- No single wheel should exceed 10-20% of total portfolio
- Maximum 5-8 active wheels at a time
- Keep 20-30% of buying power in reserve for rolls and new opportunities
- Never wheel with margin (cash-secured only for safety)

### Correlation Risk

Running multiple wheels on correlated underlyings creates concentrated risk:
- 3 tech stock wheels = essentially one large tech sector bet
- A sector rotation or market-wide event hits all positions simultaneously
- Traders should diversify across sectors but rarely track this formally

**Product implication:** A portfolio view showing sector exposure across active wheels would surface hidden correlation risk.

### Opportunity Cost

Capital locked in a wheel is unavailable for other strategies. Traders must weigh:
- Is this wheel generating enough return to justify the capital lock-up?
- Would the capital produce more in a different ticker or strategy?
- How long has this capital been deployed vs. the annualized return?

---

## Tax and Accounting Nuances

These vary by jurisdiction and individual tax situation. The persona should flag these as areas requiring validation with a tax professional, not give tax advice.

### Key Concepts the Persona Should Know

**Wash sale rules (US):**
- Selling a stock at a loss and repurchasing within 30 days before or after triggers wash sale rules
- Wheeling the same ticker can inadvertently create wash sales if a losing CC leads to call-away and the trader immediately opens a new CSP
- The disallowed loss is added to the cost basis of the replacement position

**Premium classification:**
- Short option premiums are short-term capital gains regardless of holding period
- Assignment changes the tax treatment: put premium adjusts the stock cost basis
- Call premium received is added to the sale proceeds when shares are called away

**Holding period implications:**
- Shares acquired through put assignment: holding period starts the day after assignment
- Selling a CC does not reset the holding period on the underlying shares
- Long-term vs short-term classification depends on how long shares are held post-assignment

**Product implication:** Wheelbase should track dates precisely enough to support tax reporting, but should not attempt to calculate tax liability. Consider a "tax lot" view or export capability.
