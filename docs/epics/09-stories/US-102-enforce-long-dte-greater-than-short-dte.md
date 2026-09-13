# US-102: Enforce long DTE > short DTE on PMCC rolls and subsequent short calls

**As a** PMCC trader rolling either open call or selling a new short call against my LEAPS,
**I want** Wheelbase to reject any change that would leave the short call expiring on or after my long LEAPS call,
**So that** I cannot accidentally create an uncovered short-call position.

**Epic:** [09 — PMCC Strategy End-to-End](../09-pmcc-strategy.md)  
**Phase:** 4  
**Strategy:** PMCC  
**Priority:** Safety invariant  
**Status:** Ready for product review

## Context

A PMCC is a diagonal call position: the long LEAPS is the coverage for its short call. The long option must remain open beyond the short option's expiration; equality is not sufficient because the short can remain exercisable while the long no longer provides coverage. This is a hard safety constraint, not a preferred DTE range.

[US-101](US-101-open-pmcc-position.md) enforces the rule at initial entry and owns the entry-side acceptance criteria and messages. This story covers the rest of the invariant — the short-call roll, the LEAPS roll, and each subsequent short call sold against an already-open LEAPS — and centralizes the comparison both paths share so entry and rolls cannot drift apart.

The rule is about the resulting pair of open contracts. DTE is a useful UI label, but validation compares expiration dates so it remains correct regardless of the valuation date used to display DTE.

## Acceptance Criteria

```gherkin
Background:
  Given the valuation date is 2026-09-14 in America/New_York
  And XYZ is a PMCC with one open XYZ $80 LEAPS call expiring 2027-09-17
  And XYZ has one open XYZ $110 short call expiring 2026-10-16

Scenario: Roll the short call to an expiration before the open LEAPS call
  Given the short-call roll form shows the open LEAPS expiration 2027-09-17
  When the trader submits a replacement short call expiring 2027-02-19
  Then the roll is recorded with the replacement short call open
  And the review shows the replacement short call as 158 DTE and earlier than the LEAPS expiration

Scenario Outline: Reject a short-call roll that would outlast or equal the LEAPS call
  Given the short-call roll form shows the open LEAPS expiration 2027-09-17
  When the trader submits a replacement short call expiring <replacement_expiration>
  Then an error beside the replacement short expiration says "Short call must expire before the LEAPS call."
  And the proposed roll values remain available for correction
  And the existing short call remains open with its 2026-10-16 expiration

  Examples:
    | replacement_expiration |
    | 2027-09-17             |
    | 2027-10-15             |

Scenario: Roll the LEAPS to an expiration after the open short call
  Given the LEAPS roll form shows the open short-call expiration 2026-10-16
  When the trader submits a replacement LEAPS call expiring 2028-01-21
  Then the roll is recorded with the replacement LEAPS call open
  And the review shows the replacement LEAPS as 494 DTE and later than the short-call expiration

Scenario Outline: Reject a LEAPS roll that would no longer cover the open short call
  Given the LEAPS roll form shows the open short-call expiration 2026-10-16
  When the trader submits a replacement LEAPS call expiring <replacement_expiration>
  Then an error beside the replacement LEAPS expiration says "LEAPS call must expire after the short call."
  And the proposed roll values remain available for correction
  And the existing LEAPS call remains open with its 2027-09-17 expiration

  Examples:
    | replacement_expiration |
    | 2026-10-16             |
    | 2026-10-02             |

Scenario: Sell a new short call against the open LEAPS after the previous short expires
  Given the XYZ short call expiring 2026-10-16 has expired worthless and only the LEAPS remains open
  And the new short-call form shows the open LEAPS expiration 2027-09-17
  When the trader submits a new short call expiring 2026-11-20
  Then the new short call is recorded as open against the existing LEAPS
  And the review shows the new short call as 67 DTE and earlier than the LEAPS expiration

Scenario Outline: Reject a new short call that would outlast or equal the open LEAPS
  Given the XYZ short call expiring 2026-10-16 has expired worthless and only the LEAPS remains open
  And the new short-call form shows the open LEAPS expiration 2027-09-17
  When the trader submits a new short call expiring <short_expiration>
  Then an error beside the short expiration says "Short call must expire before the LEAPS call."
  And the entered contract and fill remain available for correction
  And the PMCC still has no open short call

  Examples:
    | short_expiration |
    | 2027-09-17       |
    | 2027-10-15       |

Scenario: Roll the LEAPS while no short call is open
  Given the XYZ short call expiring 2026-10-16 has expired worthless and only the LEAPS remains open
  When the trader submits a replacement LEAPS call expiring 2028-01-21
  Then the roll is recorded with the replacement LEAPS call open
  And no long-versus-short expiration error is shown, because there is no open short call to cover

Scenario: Reject a bypassed invalid PMCC roll without a partial history
  Given a PMCC has an open LEAPS expiring 2027-09-17 and an open short call expiring 2026-10-16
  When a short-call roll request directly submits a replacement expiration of 2027-10-15
  Then the request is rejected with "Short call must expire before the LEAPS call."
  And no roll close or replacement open leg is recorded
  And both original open calls remain unchanged

Scenario: Leave a classic wheel unaffected
  Given a classic wheel has an open covered call expiring 2027-10-15
  When the trader records that covered-call roll
  Then the roll is evaluated by the classic-wheel rules
  And no PMCC long-versus-short expiration error is shown
```

## UI Changes

- On a PMCC short-call roll, show the open LEAPS expiration as read-only context above the proposed replacement expiration. Place the short-call error beside the replacement date and disable the confirm action while invalid.
- On a PMCC LEAPS roll, show the open short-call expiration as read-only context. Place the inverse LEAPS error beside the replacement date and disable the confirm action while invalid.
- When selling a new short call against an open LEAPS, show the open LEAPS expiration as read-only context, place the short-call error beside the proposed expiration, and disable the record action while invalid.
- Preserve selections, entered fills, debit/credit information, and the open form after client-side or server-side rejection. Do not show a success state for a rejected transaction.
- The shared `FormButton` currently dims only its `isPending` state, so a `disabled` confirm button still renders fully gold with a pointer cursor. Since all three sheets rely on disabling confirm, give `FormButton` a visible disabled treatment (or carry it in these sheets) so the blocked action reads as blocked.
- Entry-side presentation of this rule belongs to US-101 and is not changed here.

## Technical Notes

- Treat this as a PMCC invariant over the **resulting open pair**: `longExpiration > shortExpiration`. Compare validated calendar dates, not display strings or a cached DTE value. Calculate displayed DTE with `date-fns` using the explicit America/New_York valuation date.
- Centralize the pure comparison in PMCC domain validation. US-101 introduces the entry-side check first; part of this story is extracting that check into the shared comparator both entry and rolls call, rather than leaving a second inline copy on each roll path. US-101's entry acceptance criteria must still pass against the extracted comparator.
- Apply the comparator at every service boundary that can open or replace either leg after entry: the short-call roll, the LEAPS roll, and selling a subsequent short call against an open LEAPS. For a short roll or a new short call, validate the proposed short expiration against the currently open long expiration. For a LEAPS roll, validate the proposed long expiration against the currently open short expiration — and skip the check when no short call is open, since an uncovered LEAPS carries no naked-call risk. Reject equality as well as an inverted order. UI validation provides immediate feedback but is not authoritative.
- Validate before creating either linked roll leg. A rejected request must leave the open pair and roll history unchanged; a successful roll continues to use the existing linked close/open pair model.
- Keep the rule PMCC-specific. It must not alter classic-wheel CSP or covered-call entry/roll validation.
- Return the established IPC error envelope and map the deterministic messages above to the appropriate expiration field. Log the validation rejection at INFO and relevant inputs/checkpoints at DEBUG in the service boundary; keep pure core validation free of logging.
- Tests should cover the pure comparator, both roll services, the subsequent-short-call service, the no-open-short-call case, direct IPC/service calls that bypass renderer validation, equality, inversion, success, and unchanged transactional state after rejection. Keep US-101's entry cases green as regression coverage for the extraction.

## Out of Scope

- PMCC entry validation. US-101 owns the entry acceptance criteria, messages, and review UI for this rule; this story only extracts the comparator they share.
- Minimum long- or short-DTE preferences, delta filters, strike relationships, debit-to-width guidance, liquidity checks, and buying-power checks.
- PMCC order placement, broker-side validation, automatic roll construction, assignment handling, or alerts when an already-imported/legacy PMCC violates this invariant.
- Repairing pre-existing inconsistent PMCC data. It may be surfaced by later migration or health-check work, but this story prevents new invalid rolls.

## Dependencies

- [US-101: Open a PMCC position with two linked opening legs](US-101-open-pmcc-position.md) supplies the PMCC entry shape, its two open legs, and the first implementation of this rule at entry. Ships first.
- US-104 (short-call roll), US-105 (LEAPS roll), and US-115 (subsequent short call) expose the service paths this invariant validates, and each carries enforcement of it as an acceptance criterion. None of the three is written yet: US-101 explicitly defers "opening subsequent short calls, rolling either leg". This story defines and owns the shared comparator and its messages; the boundary stories consume it as they land, so US-102 does not block on any of them.
- [Epic 03](../03-roll-positions.md) supplies the linked close/open roll-pair pattern.

## Estimate

5 points. The comparison itself is small and already exists at entry after US-101; the work is extracting it and enforcing it at three transactionally safe boundaries — short-call roll, LEAPS roll, and subsequent short call — across renderer validation, IPC/service validation, and regression coverage.

## Domain Review

Reviewed using the options-expert skill. A short call expiring on or after its LEAPS is not protected by the PMCC long call and creates naked-call risk. Equality is therefore rejected. The rule must be evaluated against the live opposite leg for each roll, rather than only against an original-entry DTE or a configurable target range.

## Mockup

[US-102 PMCC expiration-safety mockup](../../../mockups/us-102-enforce-long-dte-greater-than-short-dte.mdx). Its `short-roll-invalid`, `leaps-roll-invalid`, and `leaps-roll-valid` states cover this story; the `entry-valid` state illustrates US-101's entry review.
