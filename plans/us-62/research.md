# Research — US-62: Covered-call breach alert

## Story summary

Fire a **medium-urgency `COVERED_CALL_BREACH`** alert when a `CC_OPEN`
position's underlying trades **at or above** the short-call strike (the call is
in the money and shares are on track to be called away). Report the percent the
stock is above the strike in the summary. The alert resolves automatically when
the stock falls back below the strike on a later evaluation.

## What already exists (verified against `src/`)

- **Pure rule engine** `src/main/core/alerts.ts` — an ordered
  `RULES: RuleDefinition[]` registry (open/closed; append new rules without
  touching the loop). Each rule declares `code`, `urgency`, an optional
  `missingData` guard, a `test` predicate, and a `summary` builder.
  - The `RuleCode` union already reserves the slot with the comment
    `// (future: 'COVERED_CALL_BREACH')` (line 18).
  - `STRIKE_PROXIMITY` (US-55) is the direct structural sibling: CSP-only,
    price-vs-strike, direction-aware. `COVERED_CALL_BREACH` is its CC-only
    counterpart.
  - Helpers already present: `formatStrike`, `proximityPercent(input)` (returns
    `|price − strike| / strike × 100` as a `Decimal`). Narrow input slices per
    rule already exist (`StrikeProximityInput = Pick<AlertEvaluationInput,
'strike' | 'currentUnderlyingPrice'>`).
- **`AlertEvaluationInput.currentUnderlyingPrice`** already carries the live
  price for **every** row (populated by the service from `priceByTicker`,
  regardless of phase) — no new input field is needed.
- **Service** `src/main/services/evaluate-alerts.ts` — `EVALUABLE_QUERY`
  already restricts to `p.status = 'ACTIVE' AND p.phase IN ('CSP_OPEN',
'CC_OPEN')` and inner-joins the active short-option leg, so `HOLDING_SHARES`
  with no open call is already excluded. Stock quotes are pre-fetched for all
  tickers and degrade to empty on provider failure. Resolution is automatic:
  `resolveAlertsNotIn` resolves any open alert whose (position, rule) key is not
  re-matched this run.
- **Persistence / schema** — `migrations/009_create_alerts.sql`:
  `rule_code TEXT NOT NULL` with **no CHECK constraint**; the partial-unique
  index is `(position_id, rule_code) WHERE status = 'open'`. A new rule code
  flows through with **no migration**.
- **Renderer** — `AlertRow.ruleCode` is an opaque `string` in
  `src/main/schemas.ts`; the US-51 queue renders `summary`/`urgency` only. No
  renderer, no settings, no threshold-config work (the rule has no configurable
  threshold — it is a fixed `price ≥ strike` test).

## Gaps to close (all in `src/main/core/alerts.ts`)

1. Add `'COVERED_CALL_BREACH'` to the `RuleCode` union (remove the reserved
   comment).
2. Add a `coveredCallBreachSummary` builder.
3. Append a `COVERED_CALL_BREACH` rule to the `RULES` registry.

Everything else (service orchestration, persistence, resolution, renderer) is
already wired and requires no change.

## Architecture Decisions

### ADR: Reuse the reserved rule code `COVERED_CALL_BREACH`

- **Decision:** Name the rule `COVERED_CALL_BREACH`, matching the slot already
  reserved in the `RuleCode` union comment and documented in
  `docs/spec/domain/alerts.md`. The story's AC prose ("a … CC_BREACH alert")
  is shorthand for this code.
- **Why:** The codebase and spec already reserved this exact name; it matches
  the verbose convention of the sibling codes (`STRIKE_PROXIMITY`,
  `EARNINGS_PROXIMITY`). Persisted `rule_code` values want to be stable and
  self-describing.
- **Alternatives considered:** Using the literal `CC_BREACH` from the AC text —
  rejected as inconsistent with the reserved name and the other codes.

### ADR: Fire on `price ≥ strike`, CC_OPEN only, medium urgency

- **Decision:** The rule matches only when `phase === 'CC_OPEN'`, the strike is
  present, the underlying price is present, and `price ≥ strike`. Urgency is
  `medium`. The percent above is `(price − strike) / strike × 100`, reused via
  the existing `proximityPercent` helper (identical value when breached, since
  `price ≥ strike` makes the absolute-value form equal to the signed form).
- **Why:** Matches the ACs exactly — the in-the-money (breach) direction is the
  time-sensitive call-away case, mirroring how CSP `STRIKE_PROXIMITY` treats the
  below-strike direction as the assignment-risk case. Medium urgency per AC.
- **Alternatives considered:** A separate signed-percent helper — unnecessary
  duplication since `proximityPercent` already yields the same magnitude when
  `price ≥ strike`. A proximity _band_ (warn just below the strike) — out of
  scope; the story defines a hard breach at/above the strike.

### ADR: Skip-guard mirrors STRIKE_PROXIMITY (missing_underlying_price)

- **Decision:** The rule's `missingData` guard returns `MISSING_UNDERLYING_PRICE`
  only when `phase === 'CC_OPEN' && currentUnderlyingPrice === null`; otherwise
  `null` (no skip for CSP/other phases). A missing price for a CC_OPEN position
  keeps any existing open `COVERED_CALL_BREACH` alert open rather than resolving
  it, consistent with US-54/55 behaviour.
- **Why:** A price outage must not spuriously resolve a real breach alert; a
  skipped rule is "not evaluated", not "cleared". Reuses the existing
  `MISSING_UNDERLYING_PRICE` reason string and the service's `skippedKeys`
  keep-open path — no service change.
- **Alternatives considered:** No guard (treat missing price as no-match) —
  rejected because it would auto-resolve breach alerts during a data outage.

### ADR: No new input field — dedicated narrow slice type only

- **Decision:** Do not add a field to `AlertEvaluationInput`
  (`currentUnderlyingPrice` and `strike` already exist and are populated for all
  phases). Add a `CoveredCallBreachInput = Pick<AlertEvaluationInput, 'strike' |
'currentUnderlyingPrice'>` alias for the helper signatures, matching the
  established per-rule narrow-slice pattern.
- **Why:** Keeps helpers reading a minimal slice (per the tighten-helper-input
  convention) without a discriminated union. `StrikeProximityInput` is the same
  shape; the shared `proximityPercent` accepts either by structural typing.
- **Alternatives considered:** Reusing `StrikeProximityInput` directly for the
  CC helper — works structurally but misleadingly names a CSP type in CC code.
  A shared `PriceVsStrikeInput` alias for both — reasonable; noted as an optional
  refactor rather than required.

## Open Questions

None.
