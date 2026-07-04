# ADR: Alert resolution is global across all open alerts, not position-scoped

<!-- generated:from us-50 -->

## Decision

The persist phase computes a **keep-open** set of `(position_id, rule_code)` keys for the current run — every matched rule **plus** every rule skipped for missing data — then marks **every** currently-open alert whose key is absent from that set as `resolved` (`status = 'resolved'`, `resolved_at = now`). This includes open alerts for positions that are no longer evaluable — closed, rolled out of window, or now lacking an active option leg. The key identity is built by a shared `alertKey(positionId, ruleCode)` helper.

## Why

Covers all three "resolve" scenarios uniformly: a cleared condition (DTE moved out of window), a leg closed/expired (the position drops out of the evaluable query), and a roll to a longer DTE. A position-scoped resolution would miss closed positions, whose open alerts would otherwise leak forever because they never appear in the evaluable query.

Skipped rules are held open (refinement post-US-50). A rule skipped for missing data (`missing_option_mark` when the option snapshot is absent, `missing_underlying_price` when the stock quote is absent) was never evaluated this run, so resolving it would misread a transient data gap as a cleared condition — clearing the alert and then reopening it with a fresh `triggered_at` on the next run once data returns. Excluding skipped keys from resolution preserves the open alert (and its original `triggered_at`) across the gap.

## Alternatives considered

- **Resolve only alerts for positions returned by the evaluable query** — rejected; closed positions never appear in that query, so their open alerts would never resolve.
- **Resolve on matched keys alone (treat a skipped rule as cleared)** — rejected; a single missing snapshot on an otherwise-firing rule would churn the alert (resolve → reopen) and lose its `triggered_at`.

## Source

- `plans/us-50/research.md`
- Feature page: `../../features/us-50-alert-engine.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
