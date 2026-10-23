# ADR: PMCC alerts select the current short call by ledger replay, not by the wheel active-leg SQL

<!-- generated:from us-106 -->

## Decision

`evaluateAlerts` makes a PMCC evaluable by resolving its **current short call** with the existing PMCC leg replay (`currentShortCallLeg` in `src/main/services/pmcc-ledger.ts`). The wheel active-leg SQL is left untouched.

- **Wheel selection is unchanged.** `EVALUABLE_QUERY` and `activeLegSubquery()` ([active-leg-resolution](./active-leg-resolution.md)) still select wheel rows only.
- **A separate PMCC path is added beside it.** In `src/main/services/evaluate-alerts.ts`:
  1. `PMCC_CANDIDATE_QUERY` selects ACTIVE PMCC positions in `PMCC_OPEN`.
  2. The module-private `loadPmccEvaluableRows({ db, failedIds, logger })` bulk-loads their legs with `readLegsByPosition`, so there are no N+1 reads.
  3. It replays each candidate with `currentShortCallLeg`. A non-null short is mapped to the existing `EvaluableRow` shape. This happens before the shared market-data prefetch, so from that point the PMCC row goes through the same loop as a wheel row.
  4. A candidate whose replay returns `null` (no current short) is left out. Its prior alerts then resolve through the normal global resolution ([alert-resolution-global](./alert-resolution-global.md)).
- **A replay failure is not a null short.** Failure isolation ([alert-evaluation-failure-isolation](./alert-evaluation-failure-isolation.md)) is extended to selection:
  - Each replay runs inside its own `try/catch`. If it throws, the service logs `alert_evaluation_failed` with the position id and adds the id to a local `failedIds` set.
  - If the bulk legs read throws, every PMCC candidate is marked failed. Wheel rows still evaluate.
  - For failed ids only, the keys of their existing open and dismissed alert rows are read with a prepared, parameter-bound query. Those keys join the final keep-open set, so the alerts stay as they were. A failed position is _unknown_, not confirmed closed.
  - No new rule-skip reason and no new public response field is introduced for a replay exception.
- **Generic short-leg rules apply to the PMCC short.** The engine receives the selected short's strike, expiration, premium, contracts and CALL OCC symbol. As a result, `EXPIRATION_IMMINENT`, `MANAGEMENT_WINDOW`, `PROFIT_TARGET` and `EARNINGS_PROXIMITY` evaluate PMCC short calls exactly as they evaluate wheel legs. OPT-14 explicitly requires this. `PMCC_ASSIGNMENT_RISK` is the only PMCC-specific rule ([alert-rule-registry](./alert-rule-registry.md)). The wheel-only `STRIKE_PROXIMITY` and `COVERED_CALL_BREACH` stay gated on their own phases. The LEAPS is never fed to the engine, and its OCC symbol is never requested. A 4-DTE short can therefore open a HIGH `EXPIRATION_IMMINENT` alert and a MED `PMCC_ASSIGNMENT_RISK` alert at the same time.

## Context / Why

- **The replay already exists and is correct.** `currentShortCallLeg` handles paired rolls and ignores LEAPS rolls. It also clears a short once its expiration, close or assignment has been recorded as a leg. The PMCC display figures are already recomputed from legs in the same way ([pmcc-ledger-recomputed-from-legs](./pmcc-ledger-recomputed-from-legs.md)). Alerts reuse that source of truth.
- **`PMCC_OPEN` alone does not prove a short exists.** The phase stays `PMCC_OPEN` after a short expires and only the LEAPS remains. Unlike the wheel ([active-leg-resolution](./active-leg-resolution.md)), the phase cannot tell which leg is active.
- **`activeLegSubquery` has other consumers.** `get-position.ts` and `list-positions.ts` also use it. Broadening it would populate the legacy `activeLeg` field on PMCC results, which is deliberately `null`.
- **Replay can throw.** `groupRollChains` parses Decimal data during replay. Selection runs before the per-position loop, so an unguarded throw there would bring back the failure that the isolation ADR exists to prevent: one bad position suppressing everyone's alerts. If a failure were treated as `null`, global resolution would also wrongly resolve that position's alerts.
- **The generic rules already have the right predicates.** They need a short leg's strike and expiration, not knowledge of the strategy, so no extra dispatch layer is needed.

## Alternatives considered

- **Extend the shared SQL selector** (the story's original technical note). Rejected. The newest `CALL` or `ROLL_TO` leg can be the LEAPS, or can bring a closed short back to life. Replaying in SQL would duplicate behaviour the ledger already implements and tests.
- **Treat a replay failure as "no short".** Rejected. A failed position's alerts would resolve when the true state is unknown.
- **Add a skip reason or response field for replay failures.** Rejected as unnecessary new contract surface. A log entry plus the preserved keys is enough.
- **Duplicate the generic rules for PMCC, or suppress them.** Rejected because it contradicts OPT-14.

## Consequences

- **Closure comes only from the ledger (accepted known gap).** `currentShortCallLeg` treats a short as current until a closing leg is recorded. It never infers closure from a past expiration date. When US-106 shipped, no production path wrote `SHORT_CALL_EXPIRED`, `SHORT_CALL_CLOSE` or `SHORT_CALL_ASSIGNED`; only the dev-only seam did ([dev-only-pmcc-leg-event-ipc](./dev-only-pmcc-leg-event-ipc.md)). Until US-119 (OPT-25) records expiration or close and US-111 (OPT-19) records assignment, a short past its expiration date stays current, and `PMCC_ASSIGNMENT_RISK` keeps firing while the stock is above its strike. Those stories close the gap by writing the closing leg; the alert service needs no change.
- **Wheel behaviour is unchanged.** The wheel SQL and rule gating are untouched. The US-101 test that asserted PMCC positions produced no alerts was replaced by an `EXPIRATION_IMMINENT` expectation for a PMCC short at 5 DTE.
- **No schema, migration or IPC change.** PMCC rows join the existing persistence and the management queue unchanged.
- **Room to grow.** The PMCC selection helpers are module-private in `evaluate-alerts.ts`, which is now about 390 lines. If the file keeps growing, the next step is to move selection into its own module.
- **A gap that predates this story remains.** On the wheel path, if `evaluatePosition` throws for a row, that row's alerts still resolve, because the per-row catch does not add keep-open keys. US-106 preserves keys only for PMCC selection failures.

## Sources

- [extract: us-106](../../.extracts/us-106.md): ADRs "Reuse PMCC replay (`currentShortCallLeg`) without broadening wheel active-leg SQL", "Replay failure is not a null short (failure isolation)" and "Generic short-leg rules ride along on the PMCC short"; Open Questions (accepted known gap)
- `plans/us-106/research.md`, `plans/us-106/data-model.md` (§ Short-leg selection), `plans/us-106/refactor-phase-results.md` (§4)
- Feature page: [us-106-pmcc-assignment-risk-alert](../../features/us-106-pmcc-assignment-risk-alert.md)
- Domain page: [alerts](../../domain/alerts.md)
<!-- /generated -->
