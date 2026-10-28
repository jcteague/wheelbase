# ADR: The wheel card's action strip mirrors the management queue

<!-- generated:from us-18 -->

## Decision

A wheel card's action strip is built from the position's **open management-queue rows**. It does
not re-evaluate alert predicates in the renderer.

- **One mapping function.** `rankWheelActions(rows, ctx)` in `src/renderer/src/lib/card-actions.ts`
  maps each row to a `CardAction`: `{ glyph, statusWord, tone, rank, summary }`.
- **Verbatim summary.** The summary is the queue row's text, word for word — except
  `STRIKE_PROXIMITY`, whose text is recomputed from the live price (decision 3).
- **Dismissals come free.** Dismissed rows are absent from the queue, so they are absent from the
  strip.

Five supporting decisions make that work:

1. **`ruleCode` joins `ManagementQueueItem`.**
   - `listManagementQueue` selects the already-stored `alerts.rule_code`, and `mapQueueRow` sets
     `ruleCode: RuleCode`.
   - The card maps a row to its lane by rule, never by parsing the summary.
   - The change is additive, with no migration. Preload already aliases the schema type, so preload
     needed no edit.
2. **Lanes are a registry keyed by `RuleCode`.** `WHEEL_LANES` is a
   `Readonly<Partial<Record<RuleCode, WheelLane>>>`.
   - **Entry shape.** Each entry is
     `{ glyph, statusWord, tone: (ctx) => CardTone, rank: (tone) => LaneRank, summary: (ctx, row) => string }`;
     `rank` and `statusWord` are literal unions (`LaneRank`, `StatusWord`).
   - **Lane numbers.** They are exported constants:
     - `LANE_RED_ASSIGNMENT = 1`
     - `LANE_GOLD_ASSIGNMENT = 2`
     - `LANE_EXPIRING = 4`
     - `LANE_MANAGEMENT_WINDOW = 5`
   - **Reserved lanes.** Lanes **0 and 3 are reserved** for US-108's ✕ and ◆, which import the same
     constants.
   - **Unlaned codes.** A code with no entry is dropped: `PROFIT_TARGET`, `EARNINGS_PROXIMITY` and
     `PMCC_*`.
   - **Ordering.** Actions are sorted stably by lane.
3. **`STRIKE_PROXIMITY` takes its tone and its words from the live quote.**
   - The tone is red (lane 1) when core's `priceDirection` reads the live quote as `'below'` the
     put strike, and gold (lane 2) otherwise (at the strike reads `'above'`).
   - The text is core's own `strikeProximitySummary` run on that same live price, so a red strip
     always says `— now in the money` and a gold one never does.
   - When the quote or strike is missing or non-numeric (core `isNumeric`), the tone is gold and the
     text is the stored queue summary.
   - `COVERED_CALL_BREACH` is always red (lane 1). Both `◷` rules are always gold.
4. **The page subscribes to the queue a second time.**
   - `PositionsListPage` calls `useManagementQueue`; TanStack Query dedupes it with the queue panel's
     subscription on the same key.
   - The page groups the rows once, with the pure `actionsByPosition(rows, ctxById)`, into a
     `ReadonlyMap<positionId, CardAction[]>`.
   - The map is passed down through `PositionsGrid`, so cards never see queue rows.
   - Only wheel positions get an entry in `ctxById`. The minimal PMCC card has no strip.
5. **Worst first.** `ActionStrip` shows the lowest-lane action. The rest go on a `+N` chip whose
   title lists one `glyph WORD · summary` line each. The worst action's tone also colours the card's
   left edge and the leg block's tint.

## Why

- **Single source of truth.**
  - The mockup assigns exactly this behaviour to US-18: "its strip text is the queue summary word
    for word".
  - Dismissals are honoured with no extra code.
  - There is no second copy of the alert thresholds in the renderer.
- **The rule is the only honest key.** The queue row carries no "in the money" flag and no
  structured direction, and summaries are prose. `rule_code` is already stored and costs one
  column.
- **A keyed registry beats an array.**
  - A lane cannot name an unknown rule or appear twice.
  - A typo in a key is a compile error.
  - This follows the [alert rule registry pattern](./alert-rule-registry.md), with no `if/return`
    chain.
- **Tone and text come from one price.** Both use the engine's exported `priceDirection` and
  `strikeProximitySummary`, so the wording rules are not copied into the renderer.
- **Grouping once at the page** keeps the cards to composition only. The dedupe makes the second
  subscription free.

## Alternatives considered

- **Re-run `evaluatePosition` in the renderer from live quotes.** Rejected. It duplicates the
  engine's inputs and thresholds, and it ignores dismissals.
- **Parse the summary text to find the rule.** Rejected as fragile.
- **A separate `alerts:list-by-position` channel.** Rejected, because it is a second read path for
  the same rows.
- **An ordered lane array like the alert `RULES`.** This was the plan and data-model design. It was
  superseded by the keyed record, for the compile-time guarantees above.

## Consequences

- **A `STRIKE_PROXIMITY` strip can read ahead of the queue panel.** The card recomputes the text
  from the streaming quote, while the queue panel shows the text from the last scheduled evaluation.
  Near the strike the card may say `0.6% below` while the panel still says `0.8% above`; the next
  evaluation brings the panel level. The card itself never contradicts its own tone.
- **Rules without a lane never reach a wheel card**, even while they are open in the queue. This
  covers the profit target, which the card shows as its `TARGET` badge, earnings proximity, and
  every PMCC rule. Adding a wheel lane is one registry entry.
- **US-108 builds on the same pieces.** Its PMCC strip is derived live, by its own story's choice,
  but it reuses `ActionStrip`, the `CardAction` shape and the `LANE_*` numbers. A PMCC queue row
  still never reaches a wheel card.
- **Merge note.** The `ruleCode` change is identical to the one on the unmerged `wb-107` branch, so
  the two branches merge cleanly.

## Sources

- [extract: us-18](../../.extracts/us-18.md)
- [feature: us-18-position-cards](../../features/us-18-position-cards.md)
- `plans/us-18/research.md` (U1, U2, U3, Architecture Decisions); `plans/us-18/data-model.md` § 1, § 2,
  § Type Design; `docs/us-18-implementation.md` § 1–2
- Builds on: [management-queue-read-path](./management-queue-read-path.md),
[alert-rule-registry](./alert-rule-registry.md)
<!-- /generated -->
