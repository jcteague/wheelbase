# US-15: Display linked roll pairs in the position detail leg timeline

**As a** wheel trader reviewing a position that has been rolled one or more times,
**I want to** see each roll as a visually linked pair (close + open) in the leg timeline,
**So that** I can trace the complete roll history, understand how each roll affected my cost basis, and spot patterns like serial rolling.

---

## Context

After US-12/13/14 enable rolling, the leg timeline (from US-11) will contain ROLL_FROM and ROLL_TO legs mixed in with regular legs. Without visual linking, these appear as disconnected rows — the trader can't tell which close paired with which open, or what the net credit/debit was for each roll. This story groups roll pairs visually and shows the net credit/debit per roll, the roll type label, and a roll count indicator when a position has been rolled multiple times.

---

## Acceptance Criteria

```gherkin
Background:
  Given the trader has a wheel on AAPL that has been rolled once during the CSP phase
  And the roll closed the $180 Apr put (cost $1.20) and opened a $180 May put (premium $2.80)
  And both legs share roll_chain_id "abc-123"

Scenario: Roll pair displayed as visually linked group in the timeline
  When the trader views the position detail leg timeline
  Then the ROLL_FROM and ROLL_TO legs with the same roll_chain_id are grouped together
  And the group has a visual connector (indent, bracket, or background color) indicating they are a linked pair
  And the group header shows "Roll #1 — Roll Out" with the fill date

Scenario: Roll pair shows net credit/debit summary
  Given the ROLL_FROM leg has premium $1.20 (cost to close) and the ROLL_TO leg has premium $2.80 (new premium)
  When the trader views the roll pair group
  Then a summary line shows "Net Credit: $1.60/contract ($160.00 total)"
  And the net credit is displayed in green

Scenario: Roll pair shows net debit in amber
  Given a roll where cost to close was $3.00 and new premium was $2.50
  When the trader views the roll pair group
  Then a summary line shows "Net Debit: $0.50/contract ($50.00 total)"
  And the net debit is displayed in amber/yellow

Scenario: Multiple sequential rolls are numbered in order
  Given the position has been rolled 3 times (3 roll pairs)
  When the trader views the leg timeline
  Then the rolls are labeled "Roll #1", "Roll #2", "Roll #3" in chronological order
  And each roll pair shows its own net credit/debit
  And a cumulative summary shows "Total roll credits: $X.XX, Total roll debits: $Y.YY, Net: $Z.ZZ"

Scenario: Roll type label reflects strike and expiration changes
  Given a roll that changed strike from $180 to $175 and expiration from Apr to May
  When the trader views the roll pair
  Then the roll type label shows "Roll Down & Out: $180 → $175, Apr 18 → May 16"

Scenario: Non-roll legs display normally between roll pairs
  Given the timeline has: CSP_OPEN, Roll #1 (ROLL_FROM + ROLL_TO), ASSIGN, CC_OPEN
  When the trader views the leg timeline
  Then the CSP_OPEN and ASSIGN and CC_OPEN legs render as normal rows
  And the roll pair renders as a grouped section between them
  And chronological order is maintained

Scenario: Running cost basis column includes roll impact
  Given the running cost basis before Roll #1 was $176.50/share
  And Roll #1 had a net credit of $1.60/contract ($1.60/share)
  When the trader views the roll pair in the timeline
  Then the ROLL_TO leg row shows the updated running cost basis of $174.90/share
```

---

## Technical Notes

- **Renderer-only story.** All data is already available from `getPosition` — legs with `legRole` ROLL_FROM/ROLL_TO and `rollChainId` field. No backend changes needed.
- **Grouping logic:** Group legs by `roll_chain_id`. Within each group, ROLL_FROM comes first (buy-to-close), ROLL_TO comes second (sell-to-open). Display as a single visual unit with a summary line.
- **Roll numbering:** Sort roll groups by the ROLL_FROM `fill_date`. Number sequentially starting from 1.
- **Roll type derivation:** Same pure function as the roll form label (compare old vs new strike and expiration). This logic should be extracted to a shared utility.
- **Extend `LegHistoryTable`** component in `src/renderer/src/components/LegHistoryTable.tsx` to detect roll pairs and render them as grouped sections.
- **Running cost basis:** The cost basis snapshot created at roll time provides the post-roll basis. Map each roll's ROLL_TO leg to its snapshot.

---

## Out of Scope

- Interactive roll history (clicking a roll pair to see more detail)
- Roll P&L as a percentage
- Charting roll history over time
- PMCC roll display (Epic 09)

---

## Dependencies

- US-11: Leg chain display with running cost basis (the table this extends)
- US-12: CSP roll (creates the ROLL_FROM/ROLL_TO legs to display)

---

## Estimate

3 points
