# ADR: Alert resolution is global across all open alerts, not position-scoped

<!-- generated:from us-50 -->

## Decision

The persist phase computes the set of matched `(position_id, rule_code)` keys for the current run, then marks **every** currently-open alert whose key is absent from that set as `resolved` (`status = 'resolved'`, `resolved_at = now`). This includes open alerts for positions that are no longer evaluable — closed, rolled out of window, or now lacking an active option leg. The matched-key identity is built by a shared `alertKey(positionId, ruleCode)` helper.

## Why

Covers all three "resolve" scenarios uniformly: a cleared condition (DTE moved out of window), a leg closed/expired (the position drops out of the evaluable query), and a roll to a longer DTE. A position-scoped resolution would miss closed positions, whose open alerts would otherwise leak forever because they never appear in the evaluable query.

## Alternatives considered

- **Resolve only alerts for positions returned by the evaluable query** — rejected; closed positions never appear in that query, so their open alerts would never resolve.

## Source

- `plans/us-50/research.md`
- Feature page: `../../features/us-50-alert-engine.md`
- Domain page: `../../domain/alerts.md`
<!-- /generated -->
