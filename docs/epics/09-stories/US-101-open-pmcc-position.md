# US-101: Open a PMCC position with two linked opening legs

**As a** trader starting a poor man's covered call position,
**I want to** record my long LEAPS call and short call together with a clear view of their contracts and cash flows,
**So that** I can track the position as one strategy without confusing the long investment with the short-call income.

**Epic:** [09 — PMCC Strategy End-to-End](../09-pmcc-strategy.md)  
**Phase:** 4  
**Strategy:** PMCC  
**Priority:** First implementation story in Epic 09  
**Status:** Ready for product review

## Context

The existing Open Wheel entry action will open a shared new-position side panel using the same sheet pattern as other trade forms. A Standard / PMCC strategy toggle inside that panel selects the entry form; Standard retains the existing opening-put workflow. A PMCC starts with a purchased long-dated call and a sold shorter-dated call; both must be visible and recorded under one position. This story delivers the complete initial recording flow and a minimal readable destination in the existing positions UI.

The first slice assumes both opening trades have already filled and are recorded together, with equal quantities of standard 100-share equity/ETF call contracts on the same underlying. Each leg has its own fill date and actual fill price. Recording a LEAPS-only position before a short call exists is a follow-up entry story; subsequent short-call expiration/closure must eventually support that state as well.

This is journal entry, not order placement. Contract quotes help identify and review trades; they are not evidence of a fill. The primary action is **Record PMCC**.

## Acceptance Criteria

```gherkin
Background:
  Given the valuation date is 2026-09-14 in America/New_York
  And XYZ is a fictional underlying trading at $100.00
  And the long leg is one XYZ $80 call expiring 2027-09-17, bought for $25.00 per share
  And the short leg is one XYZ $110 call expiring 2026-10-16, sold for $2.00 per share
  And both fill dates are 2026-09-14 and both total leg fees are $0.00

Scenario: Open the shared new-position panel
  Given the trader is viewing the positions list
  When the trader selects the existing "Open Wheel" action
  Then a right-hand "New position" panel opens over the positions list with "Standard" selected
  And the panel shows the existing standard wheel fields and "Open Wheel" submit action
  And a "Standard / PMCC" toggle is visible above the form

Scenario Outline: Switch the entry form in the same panel
  Given the new-position panel is open in <starting_mode> with an unsaved draft
  When the trader selects <selected_mode> in the strategy toggle
  Then the same panel shows <form> and the <submit_action> action
  And shared ticker and quantity remain available, with each strategy's draft retained for switching back
  And switching neither records a position nor submits hidden fields from the other strategy

  Examples:
    | starting_mode | selected_mode | form                                           | submit_action |
    | Standard      | PMCC          | Buy LEAPS call and Sell short call sections     | Record PMCC   |
    | PMCC          | Standard      | the existing opening cash-secured put fields    | Open Wheel    |

Scenario: Select the two contracts independently
  Given the shared entry panel is in PMCC mode with XYZ selected and call chains are available
  When the trader selects the XYZ $80 call expiring 2027-09-17 for the long leg
  Then the long section shows its strike, expiration, 368 DTE, quote timestamp, and available bid, ask, mid, and delta
  And the short-call selection remains independent and is limited to XYZ calls
  And the actual fill price remains a separate required input

Scenario: Review the initial cash flows
  Given both opening legs and their actual fill prices are entered
  When the entry summary recalculates
  Then it shows "LEAPS purchase cost" $2,500.00 and "Short-call credit" $200.00
  And it shows "Fees" $0.00 and "Initial net debit" $2,300.00
  And it shows "Strike width / share" $30.00 and "Debit / strike width, before fees" 76.67%
  And it does not present short-call credit as earned profit or show a guaranteed maximum profit or breakeven

Scenario: Record the position and view both legs
  Given both opening legs satisfy the PMCC entry rules
  When the trader selects "Record PMCC"
  Then the panel closes and one PMCC position appears with status "LEAPS + short call open" and initial net debit $2,300.00
  And its detail page shows both legs with their quantities, actual fills, fill dates, strikes, and expirations
  And its row in the positions list identifies PMCC and labels each leg's expiration separately
  And no broker order is submitted

Scenario Outline: Reject an unsupported or incomplete entry
  Given the entry differs from the valid example by <invalid_case>
  When the trader selects "Record PMCC"
  Then an error beside the relevant field or leg says "<message>"
  And the entered values remain available for correction and no position appears

  Examples:
    | invalid_case                                 | message                                                    |
    | the short expiration is 2027-09-17            | Short call must expire before the LEAPS call.               |
    | the short expiration is 2027-10-15            | Short call must expire before the LEAPS call.               |
    | the short underlying is ABC                  | Both calls must have the same underlying.                  |
    | the short leg is a put                       | PMCC entry requires two call options.                      |
    | long quantity is 1 and short quantity is 2   | Opening quantities must match for this PMCC entry.         |
    | the short strike is $75.00                   | Short-call strike must be above the LEAPS strike.          |
    | the short strike is $80.00                   | Short-call strike must be above the LEAPS strike.          |
    | a leg has an adjusted deliverable           | This entry supports standard 100-share contracts only.     |
    | the long actual fill price is empty         | Enter the actual LEAPS fill price.                         |
    | either quantity is 0 or fractional          | Contracts must be a positive whole number.                 |
    | either actual fill price is zero or negative | Actual fill price must be greater than zero.              |
    | either total leg fee is negative            | Fees cannot be negative.                                  |
    | the long fill date is 2026-09-15             | Fill date cannot be in the future.                         |
    | the long fill date follows the short fill   | LEAPS must be acquired no later than the short-call fill.  |
    | either expiration is on or before its fill date | Expiration must be after the fill date.                |
    | either expiration is before 2026-09-14      | Use an unexpired contract for opening a current position.  |
    | total short credit exceeds total long cost | This PMCC entry requires a net debit before fees.          |

Scenario Outline: Continue when market data cannot supply a selection
  Given <market_state>
  When the trader views the affected contract selector
  Then it displays "<notice>"
  And manual contract and actual fill entry remains available
  And existing selections and actual fill inputs are preserved

  Examples:
    | market_state                              | notice                                               |
    | the call chain request is still loading  | Loading call contracts…                              |
    | the selected filters return no contracts | No matching calls. Adjust filters or enter manually. |
    | the market-data request failed           | Quotes unavailable. Enter your filled trade manually. |
    | the options quote is stale               | Quote is stale. Verify against your actual fill.     |

Scenario: Recover from a failed save without a partial position
  Given a valid completed entry and a storage failure during recording
  When the trader selects "Record PMCC"
  Then "Could not record PMCC. Your entries are preserved. Try again." appears
  And neither an incomplete PMCC nor a standalone opening leg appears
  And "Record PMCC" becomes available again after the failed attempt

Scenario: Cancel without recording
  Given the trader has an unsaved PMCC entry
  When the trader selects "Cancel"
  Then the panel closes with no new position and the underlying list retains its filters and scroll position
```

## UI Changes

### Shared entry point and side-panel layout

- Keep **Open Wheel** as the single entry action. It opens the **New position** sheet over the current screen. There is no additional Open PMCC button or separate PMCC entry page.
- Reuse the existing right-hand sheet anatomy: header with close control, scrollable body, fixed footer, and background dimming. The underlying positions list keeps its current filters and scroll position.
- Place a **Standard / PMCC** segmented toggle at the top of the panel, above the form. Standard is the default whenever Open Wheel starts a fresh entry. The title remains **New position** in either mode.
- **Standard:** render the existing cash-secured-put fields, optional advanced fields, validation, and **Open Wheel** submit behavior. Preserve existing screener-prefilled standard entry within this shared sheet.
- **PMCC:** render shared ticker and equal quantity, followed by vertically stacked **Buy LEAPS call** and **Sell short call** sections. Keep the same panel width when toggling; scroll the body to accommodate the additional fields rather than opening a wider page or another sheet.
- Use a 460px panel in the mockup, matching the existing wider-sheet precedent; constrain it to available width in production. The two leg sections use compact two-column fields inside the single scrolling column.
- Preserve shared ticker/quantity and each mode's draft while toggling within an open panel. Do not copy a put strike, expiration, or premium into a call leg. Only the selected strategy's values and validation participate in submission.
- After cancellation or successful recording, reopening starts a fresh Standard entry. A failed save preserves the active strategy and its draft in the open panel. Disable mode switching while saving.
- Keep **Cancel** and the active strategy's primary action in the fixed footer. Cancel, close, Escape, and scrim dismissal use the established sheet behavior and restore focus to the entry trigger.

### Contract selection and actual fills

| Control / information | Buy LEAPS call                                                  | Sell short call                                                  |
| --------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| Contract picker       | Same-underlying calls; initial filter 180+ DTE, delta 0.70–0.85 | Same-underlying calls; initial filter 20–45 DTE, delta 0.25–0.35 |
| Selection details     | Strike, expiration, DTE, bid/ask/mid, delta, quote time         | Strike, expiration, DTE, bid/ask/mid, delta, quote time          |
| Fill input            | **Actual purchase price / share**, required                     | **Actual sale price / share**, required                          |
| Supporting input      | Fill date; total fees for this leg, default $0.00               | Fill date; total fees for this leg, default $0.00                |
| Cash-flow preview     | Purchase price × 100 × contracts, shown as a debit              | Sale price × 100 × contracts, shown as a credit                  |

- Contract selection fills structural fields only. The user supplies actual fill prices; refreshed quotes never overwrite them. Changing the ticker clears both contract selections and their fill prices to prevent accidental reuse across symbols.
- Each picker offers **Enter manually**. Missing Greeks, missing quotes, and out-of-range delta/DTE preferences do not prevent recording structurally valid contracts. The preset ranges are search defaults, not hard safety rules.
- Keep market-derived numbers visibly separate from actual fill inputs. Show an em dash for missing quotes or Greeks rather than zero. Do not require a live connection to record a completed trade.
- Display field errors next to the affected leg, plus a clear message for pair-level errors. Use the same validation at the main-process boundary.

### Review and confirmation

- Summary labels: **LEAPS purchase cost**, **Short-call credit**, **Fees**, **Initial net debit**, **Strike width / share**, and **Debit / strike width, before fees**.
- For the example: $2,500 − $200 + $0 = **$2,300** initial net debit. The ratio is $23 / $30 = **76.67%**. Adding $1 of fees to each leg changes the debit to **$2,302**, while the before-fees ratio stays **76.67%**.
- Do not label collected opening credit as realized income, or use the wheel's stock cost-basis label. No 75% ratio gate is required: that is a trader preference, not a contract-validity rule.
- Primary action **Record PMCC** becomes **Recording…** and is disabled while a save is pending. Repeated clicks during that request must not create duplicate positions. Cancel closes the sheet and leaves the underlying screen in place.
- After success, close the sheet and show **PMCC recorded** on the underlying positions screen. The new PMCC row opens its detail page when selected. Creation records both legs atomically; a failed attempt preserves the whole form.

### Minimal position display included in this story

- Existing positions list: one row per PMCC, a **PMCC** strategy badge, the **LEAPS + short call open** state, explicitly labeled long/short expirations and DTE, and initial net debit. Reuse the table styling and navigation.
- Existing detail page: shared ticker header and two leg-reference panels showing the recorded contracts and fills. This is the minimum view needed to verify what was saved.
- Avoid feeding a PMCC through wheel-only phase labels, short-option P&L formulas, premium profit-target badges, or **Record Call-Away** actions. A combined live P&L should display as unavailable until the later PMCC valuation story supplies it.
- Dedicated roll/close actions, richer LEAPS risk metrics, combined live P&L, and the full two-leg timeline are follow-up stories. This initial destination must remain truthful without them.

## Technical Notes

- Reuse `SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, `Field`, `NumberInput`, `DatePicker`, `FormButton`, and `SectionCard`. Follow the existing sheet portal/dismissal pattern. A shared new-position sheet owns the strategy selection and shows the Standard or PMCC form inside it.
- Use React Hook Form plus a Zod v4 resolver, `Controller` for contract/date selection, and `useWatch` for debit previews. Use Tailwind utilities and `wb-*` tokens. Navigation must remain hash-based.
- Adapt `NewWheelPage.tsx` entry routing and screener promotion to the shared panel; no standalone PMCC route. Consult `NewWheelForm.tsx`, `PositionCard.tsx` (currently a table row), `PositionDetailActions.tsx`, and `position-cockpit/PositionCockpit.tsx`. The current single `activeLeg` assumption cannot represent both opening calls.
- Use a PMCC creation payload with explicitly named long and short legs and a strategy discriminator. Keep WHEEL behavior compatible; choose internal PMCC phase names during implementation rather than overloading `CC_OPEN`.
- Create one position, the long BUY_TO_OPEN leg, the short SELL_TO_OPEN leg, and the initial debit record in one service-layer SQLite transaction. These are opening legs linked by position, not a roll pair. A thin IPC handler validates and calls the service through `handleIpcCall`.
- Use the existing provider abstraction for chains and quotes. Do not introduce direct provider HTTP calls in the renderer or couple this flow to a particular market-data vendor.
- Use `decimal.js` and the existing 4 dp TEXT money convention. Make the option-price unit explicit: $25.00 per share means $2,500 per standard contract. Initial debit includes opening fees; the ratio explicitly excludes them.
- Calculate calendar DTE using `date-fns` with an explicit America/New_York valuation date. The reference dates produce 368 long DTE and 32 short DTE. Compare actual expiration dates when enforcing ordering.
- Validate ticker/contract type, standard deliverables, quantities, positive strikes/fills, nonnegative fees, valid fill dates, expiration ordering, higher short strike, and positive initial net debit before fees. The higher-strike/equal-quantity rules define this supported PMCC entry shape; they are not universal restrictions on all diagonal strategies.
- Only show the new PMCC on surfaces that can handle its strategy. Existing wheel-only polling, assignment detection, alerts, and valuation must skip unsupported PMCC processing safely until the relevant follow-up ships.
- INFO: PMCC recorded or validation rejected. DEBUG: validated entry inputs, debit calculation result, and transaction checkpoints at the service boundary. Keep core calculations free of logging and I/O.

## Out of Scope

- Broker order placement or automatic confirmation of fills (Epic 10).
- LEAPS-only initial entry, importing broker holdings, recording already-expired historical positions, adjusted contracts, unmatched quantities, and multiple long anchors.
- Opening subsequent short calls, rolling either leg, closing legs/the whole position, assignment resolution, or expiration/exercise lifecycle handling.
- Full PMCC cost-basis history, realized/unrealized P&L engine, live two-leg cockpit, timeline enhancements, and PMCC management alerts.
- PMCC screener ranking, screener promotion, IVR analytics, and IV term-structure comparisons.
- Modeled maximum profit and breakeven. With different expirations, those depend on assumptions about the remaining long call's value.

## Dependencies

- [Epic 01](../01-open-and-track-csp.md): position persistence and manual-entry infrastructure.
- [Epic 04](../04-position-dashboard.md): shared positions list and detail navigation.
- [US-64](../08-stories/US-64-pull-option-chains-for-watchlist.md): existing option-chain retrieval infrastructure; confirm support for long-dated calls during planning.
- [US-31](../06-stories/US-31-market-data-provider-adapter.md): provider abstraction.
- Follow-up Epic 09 stories build on these initial legs for lifecycle changes, debit history, alerts, and full dashboard/cockpit support. They are not prerequisites for recording the initial position.

## Estimate

8 points. One entry workflow across renderer, IPC, service, and persistence with a minimal saved-position view. If implementation requires substantial new chain infrastructure, extract that prerequisite rather than expanding this story into all PMCC management.

## Domain Review

Reviewed using the options-expert skill: long entry is buy to open; short entry is sell to open; both calls remain independently identifiable; debit includes fees exactly once; quote marks are not actual fills; collected credit is not realized profit. Initial support is for standard equal-quantity diagonals with the long expiration later and the short strike higher.

The debit-to-width ratio is descriptive, not a guarantee of safety or return. Max profit and breakeven at short expiration depend on the remaining long option's value and volatility: [Fidelity / Cboe diagonal-spread guide](https://www.fidelity.com/learning-center/investment-products/options/options-strategy-guide/long-diagonal-spread-calls).

## Mockup

[US-101 shared side-panel mockup](../../../mockups/us-101-open-pmcc-position.mdx). Click Open Wheel, then switch Standard / PMCC in the same right-hand sheet. Uses fixed fictional field values; panel opening, switching, closing, and sample confirmation are interactive. Additional review states are outside the app frame. Render with the existing `pnpm mockups` viewer.
