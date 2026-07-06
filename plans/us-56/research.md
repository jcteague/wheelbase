# Research: US-56 — Earnings-Proximity Alert

Story: `docs/epics/07-stories/US-56-earnings-proximity-alert.md`
No mockup exists (`mockups/us-56-*.mdx` absent; the story confirms the queue treatment is covered by the US-51 dashboard mockup). There is **no renderer work** in this story — the US-51 management queue displays new rule codes transparently.

## Context summary (what already exists)

- **Alert engine backbone (US-50)** — pure `RULES: RuleDefinition[]` registry in `src/main/core/alerts.ts`; `evaluatePosition(input) → { matches, skipped }`. `EARNINGS_PROXIMITY` is already reserved as a future `RuleCode` in a comment.
- **Async evaluation with boundary enrichment (US-53/54/55)** — `evaluateAlerts` (`src/main/services/evaluate-alerts.ts`) pre-fetches stock quotes + option snapshots concurrently via `fetchOrDegrade` (WARN + degrade-to-empty on failure), then runs the pure engine per position inside a per-position `try/catch`, then persists in one transaction. The earnings feed slots in as a **third concurrent boundary fetch**.
- **Skip semantics** — a rule with missing input records `SkippedRule { ruleCode, reason }`; the service logs `alert_rule_skipped` at DEBUG and adds the key to the keep-open set (skipped ≠ cleared). This directly satisfies AC 4 ("missing earnings data skips the rule without failing the run").
- **Alerts table** — `rule_code` is plain TEXT with a partial unique index on `(position_id, rule_code) WHERE status='open'`. A new rule code needs **no migration, no IPC change, no renderer change**.
- **DTE helper** — `computeDte(expiration, now)` in `src/main/core/dte.ts` uses `differenceInCalendarDays(parseISO(date), now)`. The same helper computes "calendar days until earnings", which makes the "earnings on or before expiration" check a simple `daysToEarnings <= dte` comparison.
- **Auxiliary-feed precedent (US-43/44 IVR)** — standalone integration module with retries/backoff, module-level throttle/session cache, injectable fetcher into the consuming service, and env-var-key loading (`massive-credentials.ts` pattern).

## Earnings-date source (the story's blocking dependency)

No earnings data exists anywhere in the codebase; Epic 07 has no separate feed story, so US-56 builds the feed. Findings:

| Source                    | Endpoint                                                                    | Cost                         | Notes                                                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Massive (Benzinga add-on) | `GET /benzinga/v1/earnings`                                                 | **$99/mo add-on**            | Cleanest (has `date_status: confirmed\|projected`) but not on base plans — disproportionate for a single-user app                                                                                                     |
| **Finnhub (chosen)**      | `GET https://finnhub.io/api/v1/calendar/earnings?symbol=X&from=&to=&token=` | **Free tier** (60 calls/min) | Official keyed JSON API; `token` query-param auth mirrors the Massive `apiKey` style. Free tier limits the queryable window to roughly ±1 month — sufficient for a 10-day proximity rule. No confirmed/projected flag |
| Nasdaq unofficial API     | `api.nasdaq.com/api/analyst/{symbol}/earnings-date`                         | Free, no key                 | Unofficial; same risk class as the Barchart scrape                                                                                                                                                                    |
| Alpaca                    | —                                                                           | —                            | **Not available** — Corporate Actions API has no earnings dates                                                                                                                                                       |

**User decision (2026-07-04): Finnhub free tier.** Requires a free Finnhub API key.

Finnhub response shape (trimmed):

```json
{
  "earningsCalendar": [
    {
      "date": "2026-08-14",
      "hour": "amc",
      "symbol": "NVDA",
      "quarter": 2,
      "year": 2026,
      "epsEstimate": 1.43,
      "epsActual": null
    }
  ]
}
```

Only `date` and `symbol` matter to this story.

## Architecture Decisions

### ADR: Finnhub free tier as the earnings-date source

- **Decision:** Fetch next-earnings dates from Finnhub's earnings-calendar endpoint (`/api/v1/calendar/earnings?symbol={ticker}&from={date}&to={date}&token={key}`), one request per ticker.
- **Why:** Official, keyed, free at this app's scale (single user, handful of active tickers, 60 calls/min limit), JSON over HTTPS with query-param auth matching the existing Massive adapter conventions. Massive's own earnings data is a $99/mo Benzinga add-on — disproportionate; Alpaca has no earnings endpoint.
- **Alternatives considered:** Massive Benzinga add-on (rejected: cost), Nasdaq unofficial API (rejected: unofficial/brittle; fallback if Finnhub's free window proves too narrow), Yahoo scraping (rejected: most brittle, active anti-bot).

### ADR: Standalone earnings integration module, not a `MarketDataProvider` method

- **Decision:** New `src/main/integrations/finnhub-earnings.ts` exposing a batch `fetchNextEarningsDates(tickers) → Promise<Record<ticker, isoDate>>`; it is **not** added to the `MarketDataProvider` type or the market-data factory.
- **Why:** `MarketDataProvider` is the Massive vendor seam — Massive cannot serve earnings on the current plan, so putting the method there would force every provider (including the fake) to implement a capability the primary vendor lacks. The Barchart IVR scraper (US-43) is the established precedent for a vendor-specific auxiliary feed living in its own integration module.
- **Alternatives considered:** extend `MarketDataProvider` (rejected: wrong seam, breaks "factory picks one vendor" model); extend `BrokerProvider` (rejected: Alpaca has no earnings data); a new generic multi-vendor provider abstraction (rejected: speculative — one vendor, one consumer).

### ADR: Transient per-run boundary fetch with an in-module TTL cache — no SQLite table, no scheduled collector job

- **Decision:** `evaluateAlerts` pre-fetches earnings dates as a third concurrent `fetchOrDegrade` alongside stock quotes and option snapshots. The integration module holds a module-level per-ticker cache (12 h TTL, negative results cached too) so the 60 s evaluation cadence produces roughly one Finnhub burst per half-day, not one per run.
- **Why:** Matches the market-data domain invariant ("market data is transient — no SQLite rows") and the exact enrichment shape US-53/54/55 established; missing data naturally degrades to a skip. A persisted snapshot table + scheduled collector (the IVR pattern) exists for IVR because IVR needs _history_; earnings proximity needs only the _next_ date, so the table, migration, collector job, and read path would be speculative infrastructure. The TTL cache is ~15 lines and follows the Barchart module-level session-cache precedent.
- **Alternatives considered:** IVR-style `earnings_snapshot` table + after-close collector job (rejected: 4 extra artifacts — migration, collector service, job registration, test seams — for data that needs no history); uncached per-run fetch (rejected: ~4k Finnhub calls per market day for near-static data).

### ADR: Query window spans 7 days back to 30 days forward; prefer the next upcoming event

- **Decision:** The integration queries `from = now − 7d`, `to = now + 30d` and selects, per ticker, the earliest event with `date >= today`, falling back to the most recent past event when no upcoming event exists in the window.
- **Why:** The 30-day lookahead comfortably covers the 10-day rule (and stays inside Finnhub's free-tier window). The 7-day lookback exists purely for **alert resolution**: the morning after earnings pass, a `from = today` query would return nothing (next event ~90 days out, beyond the window), the input would go `null`, the rule would _skip_, and — because skips keep alerts open by design — the stale "Earnings in N days" alert would freeze open until the leg closed. A recent-past event instead yields negative `daysToEarnings`, the predicate returns false, and the open alert resolves on the next run.
- **Alternatives considered:** `from = today` only (rejected: post-earnings resolution freeze described above); distinguishing "feed succeeded, no event" from "feed failed" with a tri-state engine input (rejected: AC 4 treats "no earnings date available" uniformly as a skip, and the flat `null → skip` shape matches every existing rule input).

### ADR: Engine input carries precomputed `daysToEarnings` plus raw `expiration`

- **Decision:** Extend `AlertEvaluationInput` with `daysToEarnings: number | null` (computed in the service via the shared `computeDte(nextEarningsDate, now)`) and `expiration: string | null` (raw leg expiration, needed by the summary template). The predicate is `daysToEarnings >= 0 && daysToEarnings <= 10 && dte !== null && daysToEarnings <= dte`; the summary is `Earnings in {daysToEarnings} days before your {expiration} expiration`.
- **Why:** The engine is pure and has no `now`, so day-count math must happen at the boundary — exactly how `dte` already works. Comparing two `computeDte` results (`daysToEarnings <= dte`) is equivalent to `earningsDate <= expirationDate` and reuses one date-math code path (no `timestamp.slice` string comparisons, per the date-handling standard). A narrow `EarningsProximityInput` Pick-slice types the rule helpers, per the established helper-input convention.
- **Alternatives considered:** passing raw `nextEarningsDate` and computing inside the engine (rejected: engine lacks `now`; would break input-shape symmetry with `dte`); comparing ISO date strings lexicographically (rejected: date-handling standard requires date-fns comparisons).

### ADR: Finnhub API key via env-var loader, mirroring Massive credentials

- **Decision:** `loadFinnhubApiKey()` reads `import.meta.env.MAIN_VITE_FINNHUB_API_KEY` with a `process.env.FINNHUB_API_KEY` runtime fallback (the `massive-credentials.ts` pattern). A missing key makes the batch fetch log one WARN and return empty — the rule skips everywhere and every other rule is unaffected.
- **Why:** Simplest precedent that already exists in the codebase for a static per-install key; no settings UI, no encrypted storage, no migration. The app must remain fully functional without the key (failure-isolation ADR).
- **Alternatives considered:** encrypted `credential_settings` + Settings UI like Alpaca (rejected: user-facing settings work is outside this story's scope; can be promoted later if key management becomes a real need).

### ADR: Rule shape — medium urgency, phase-agnostic over open short legs, co-fires with existing rules

- **Decision:** `EARNINGS_PROXIMITY` is `urgency: 'medium'`, quick action `Review position`, applies to any evaluable position (`CSP_OPEN` or `CC_OPEN` — the evaluable-set query already restricts to open short option legs), and co-fires independently of the DTE/profit/proximity rules. Skip reason: `missing_earnings_date` when `daysToEarnings === null`; `missing_dte` when `dte === null` (the expiration comparison is impossible without it). Constant `EARNINGS_PROXIMITY_MAX_DAYS = 10`.
- **Why:** Medium urgency and the summary template come verbatim from the ACs. Gap-risk applies to CSPs and CCs alike (AC background says "open short option"). Co-firing follows the US-53/54/55 decision — orthogonal conditions, no AC asks for suppression.
- **Alternatives considered:** suppressing EARNINGS_PROXIMITY inside the EXPIRATION_IMMINENT window (rejected: AC 3's scenario has DTE 5 where EXPIRATION_IMMINENT fires and EARNINGS_PROXIMITY correctly doesn't for its own reason; no cross-rule precedence exists or is asked for).

### Deliberately accepted limitations (documented, not built)

- **Post-earnings skip-freeze tail:** if earnings pass and the _next_ event is beyond the 30-day window **and** the 7-day lookback has also rolled off, the input goes `null` → skip → an open alert would stay frozen. In practice the lookback covers the resolution window (the predicate resolves the alert on the first post-earnings run), so this only matters after 7+ consecutive days of the leg staying open post-earnings with the alert never once evaluating false — not reachable given the lookback.
- **No confirmed-vs-projected distinction:** Finnhub's free calendar has no `date_status`; the rule treats every returned date as actionable. Benzinga-grade status filtering is a future enhancement if the source is ever upgraded.
- **Plural summary wording:** the summary always reads `days` (e.g. "Earnings in 1 days") — consistent with the existing `Expires in {dte} days` template; the ACs only pin the 6-day string.
- **No Playwright e2e / no env-var fake seam:** AC coverage lives in the vitest `evaluate-alerts.e2e.test.ts` suite with an injected earnings stub, exactly as US-53/54/55 did. A `WHEELBASE_FAKE_EARNINGS` seam (fake-ivr pattern) can be added later if manual QA needs it.

## Open Questions

None — the single blocking unknown (earnings-date source) was resolved by the user in favor of Finnhub's free tier on 2026-07-04.
