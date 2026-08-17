# Research: US-68 — Promote a screener result to the new wheel form

All unknowns were resolved by reading the existing codebase and spec wiki — the story
needs **no new IPC surface, no service, no engine change, and no migration**. It is pure
renderer work stitched over four existing seams:

| Need                          | Existing seam                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Cross-page pre-fill           | `#/new?ticker=…` hash query string (`NewWheelPage` already reads `useSearch()`)                         |
| Fresh option quote            | `window.api.getOptionSnapshots` → `api/market-data.ts#getOptionSnapshots` (US-33/39)                    |
| OCC symbol construction       | `src/shared/option-symbol.ts#buildOccSymbol` (renderer-builds-occ-symbols ADR)                          |
| Market open/closed            | `useMarketStatusDisplay()` → `'LIVE' \| 'EXT' \| 'CLOSED' \| …` (market-status-pill ADR)                |
| Watchlist note for thesis     | `useWatchlist()` / `api/watchlist.ts` — `notes` column shipped with US-63 (`migrations/012`)            |
| Non-blocking banner rendering | `components/ui/AlertBox.tsx` (`warning` gold / `success` green variants; soft-client-side-warnings ADR) |
| Quote-time formatting         | `lib/screener-format.ts#fmtQuoteTime` (`HH:mm:ss` local)                                                |
| DTE                           | `lib/format.ts#computeDte`                                                                              |

Verified against source (not just the spec): `newWheelSchema` fields
(`src/renderer/src/schemas/new-wheel.ts`), `NewWheelForm` defaultValues and mutation
payload, `ScreenerCandidate` shape (`api/screener.ts` — `strike` is a 4dp string,
`mark` 2dp, `timestamp` ISO), `fetchOptionSnapshots` degrade semantics
(`src/main/services/market-data.ts` — per-symbol `not_found` is skipped; any other
provider error rejects and surfaces as `ok:false` → renderer `ApiError`), and the
fake provider's **per-call** env reads (`src/main/integrations/fake-market-data.ts`).

## Architecture Decisions

### ADR: Promoted payload travels via the hash query string, not global state

- **Decision:** "Promote to trade" navigates to
  `#/new?promoted=1&ticker=…&strike=…&expiration=…&premium=…&quotedAt=…[&thesis=…]`.
  `NewWheelPage` parses the search string into a `PromotedCandidate` (or `null`) and
  passes it to `NewWheelForm`. Strike is normalized from the candidate's 4dp string via
  `Decimal#toString()` (`'180.0000'` → `'180'`, matching the AC); premium is carried
  verbatim (`'2.70'`).
- **Why:** The [wouter-hash-routing-query-prefill ADR](../../docs/spec/architecture/02-adrs/wouter-hash-routing-query-prefill.md)
  already established query strings as the mechanism for one-shot navigation context
  (`?ticker=` from ExpirationSheet / CallAwaySuccess). This extends the existing pattern
  instead of introducing a store; the payload is five scalars plus an optional ≤500-char
  thesis, well within URL limits. Malformed/missing `promoted` params degrade to the
  plain form (existing `?ticker=` behavior is preserved untouched).
- **Alternatives considered:** Zustand/Context/global state (rejected by the existing
  ADR for exactly this shape of problem); a renderer module-level "pending promote"
  variable (breaks on reload, untestable); passing only `contractId` and re-deriving the
  rest from the screener cache (fails if the query cache is cold on the form page).

### ADR: Thesis is seeded at the source page from the watchlist cache

- **Decision:** `ScreenerPage` calls `useWatchlist()`; the promote click looks up the
  candidate ticker's `notes` and, when non-empty, URL-encodes it into the `thesis`
  param. If the watchlist query hasn't resolved (or has no note), the param is omitted —
  thesis degrades to empty, per the story's dependency note on US-69.
- **Why:** Seeding at the destination would force `NewWheelPage` to gate form mount on
  an async watchlist fetch (RHF `defaultValues` are read once), adding loading states
  for one optional string. The source page already has (or cheaply gets) the cached
  watchlist; the query-string carry keeps the form synchronous.
- **Alternatives considered:** destination-side `useWatchlist` + `reset()` when data
  lands (racy against user typing, more code); destination-side render gating (spinner
  complexity for an optional nicety).

### ADR: Fresh-quote reconciliation is renderer-only over the existing option-snapshots IPC

- **Decision:** A new hook `usePromotedQuote(promoted)` builds the single OCC put symbol
  with `buildOccSymbol` and runs a **one-shot** TanStack query over the existing
  `getOptionSnapshots` adapter: `enabled` only when a promoted payload exists,
  `refetchInterval: false`, `refetchOnWindowFocus: false`, `retry: false`,
  `staleTime: Infinity`, under a new promote-scoped key in `marketDataQueryKeys`
  (vendor-scoped-query-keys ADR). A missing symbol (`unavailable: true`) and a rejected
  query are both treated as "couldn't refresh".
- **Why:** The story's re-fetch is a point-in-time confirmation on form open, not a live
  ticker — `useOptionSnapshots`'s 60s polling would keep flipping the banner while the
  trader types. No new IPC handler is needed; `market-data:optionSnapshots` already
  returns `{ mid, timestamp }` for one symbol, and its failure already maps to an
  `ApiError` the hook can degrade on (mirroring the boundary-I/O rule of the
  alert-evaluation-failure-isolation ADR: the failed fetch never blocks the form).
- **Alternatives considered:** reusing `useOptionSnapshots` (polling semantics wrong;
  shared query key would cross-contaminate cockpit caches); a new dedicated IPC handler
  (duplicate surface for data the existing handler already returns).

### ADR: Price-moved test is a pure helper — deviation must exceed max($0.05, 5%)

- **Decision:** `markMovedMaterially(promotedMark, freshMark)` in
  `src/renderer/src/lib/promote.ts`, using `decimal.js`:
  `|fresh − promoted| > max(0.05, 0.05 × promoted)` — strict `gt`, so a deviation
  exactly at the threshold does **not** warn. All promote helpers (param build/parse,
  moved test, banner derivation) live in this one cohesive lib module with no I/O.
- **Why:** The story pins the formula ("both the tick-noise floor and the relative test
  must be exceeded" ≡ exceeds the max of the two). A pure helper is unit-testable
  independent of the form, matching the `openCcGuardrail.ts` precedent in the
  soft-client-side-warnings ADR. AC check: promoted 2.70 → threshold 0.135; fresh 2.50 →
  deviation 0.20 → warns; fresh 2.68 → 0.02 → silent. Sub-$1 floor: 0.60 → threshold
  0.05; fresh 0.64 → silent, fresh 0.66 → warns.
- **Alternatives considered:** computing inline in the component (untestable, violates
  the pure-helper precedent); doing the comparison main-process-side (would need a new
  IPC surface for a display-only concern).

### ADR: One banner slot with a fixed precedence — offline > stale > moved > edited > match

- **Decision:** `derivePromoteBanner(...)` returns exactly one banner state:
  1. `offline` (gold) — re-fetch failed or symbol unavailable: _"Couldn't refresh quote —
     showing screener snapshot from {quotedAt}. Verify before recording."_
  2. `stale` (gold) — market display is `CLOSED` **or** `EXT`: _"Market closed — the
     pre-filled mark is a stale after-hours snapshot (quoted {time}). Verify before
     recording."_
  3. `moved` (gold) — `markMovedMaterially` true: _"Price moved: quoted $2.70 → now
     $2.50 — review before submitting."_
  4. `edited` (green) — trader's premium ≠ promoted premium: _"Recording your entered
     price ($2.65), not the screener snapshot ($2.70)."_
  5. `match` (green) — fetch succeeded, no material move: _"Fresh quote $2.68 — no
     material move from the promoted $2.70."_ (exact-match renders _"Fresh quote matches
     the promoted mark — $2.70."_ per the mockup)
     While the re-fetch is pending, no banner renders. The banner is always non-blocking —
     submit is never disabled by any of these states.
- **Why:** The mockup shows exactly one banner per state and the states genuinely
  overlap (a CLOSED-market fetch "succeeds" with the 16:00 close, so `match`/`moved`
  would mislead — `stale` must win; `offline` outranks `stale` because it explains why
  no fresh time is shown). A fixed chain mirrors the verdict-precedence-chain ADR and
  keeps the derivation a pure, exhaustively testable function.
- **Alternatives considered:** stacking multiple banners (mockup shows one; two gold
  warnings saying "verify before recording" is noise); keying stale off a timestamp age
  heuristic (rejected for the same reason US-66 rejected it — the pill's session
  derivation is the single source).

### ADR: The re-fetch never writes into form state

- **Decision:** The fresh quote flows only into the provenance strip (its `Quoted
HH:mm:ss` updates to the fresh timestamp on success) and the banner. The premium
  field's value is set once, from the promoted mark, in `useForm({ defaultValues })` —
  no `reset()`, no `setValue()` on fetch resolution.
- **Why:** The story is explicit ("the re-fetch never overwrites the premium field") and
  two ACs assert the field still shows `2.70` after a fresh 2.68/2.50 arrives. The
  trader records their actual fill, not the mark. Keeping fetch results out of RHF state
  also sidesteps every race between resolution and user typing.
- **Alternatives considered:** none viable — overwriting is AC-forbidden.

### ADR: Derived capital/yield row and promote chrome render only in promoted mode

- **Decision:** `NewWheelForm` gains an optional `promoted?: PromotedCandidate` prop.
  When present it renders the provenance strip, the banner slot, a derived row
  (capital required = strike × 100 × contracts, grouped 0dp per the AC's `$18,000`;
  yield-if-flat = premium/strike and × 365/DTE annualized, recomputed live via
  `useWatch` per the mockup's `edited` state), and a `{dte} DTE` hint under expiration.
  Contracts' default value becomes `'1'` in promoted mode (AC: "contracts defaults
  to 1"). When absent, the form renders byte-for-byte as today — US-1 and the existing
  `?ticker=` flows are untouched.
- **Why:** Every AC that mentions capital/yield/provenance is framed inside the promote
  flow, and the mockup is the promoted form. Scoping the new chrome to promoted mode
  keeps the US-1 surface stable (Simplicity First) while `useWatch` for reactive derived
  values follows the CLAUDE.md form rules.
- **Alternatives considered:** always rendering the derived row (scope creep into US-1's
  accepted UI); a separate `PromotedWheelForm` component (would duplicate the entire
  field grid and the success flow for one prop's worth of difference).

### ADR: E2E simulates quote drift and outage by mutating main-process env at runtime

- **Decision:** The e2e spec reuses the US-66 screener fixtures/helpers (AAPL $180 put,
  mid 2.70, Δ0.28, 37 DTE) and, between "screener results rendered" and "Promote
  clicked", mutates the fake provider's fixtures from the test via
  `app.evaluate(() => { process.env.WHEELBASE_MOCK_OPTION_SNAPSHOTS = … })` (drifted
  mark / fresh timestamp) or `process.env.FAKE_MARKET_DATA_ERROR = 'unavailable'`
  (outage). CLOSED/EXT scenarios use the existing `marketStatus` launch fixture.
- **Why:** `FakeMarketDataProvider` re-reads `process.env` on **every call**
  (`buildMockMap` / `maybeThrow`), so runtime mutation needs no new test seam — the
  screener run sees the original quote and the form's re-fetch sees the drifted/failed
  one, which is exactly the story's temporal split. Playwright's
  `ElectronApplication.evaluate` runs in the main process.
- **Alternatives considered:** a new env seam for "second fetch differs" (unnecessary);
  stubbing the IPC from the renderer (violates the US-65/66 nothing-between-IPC-and-DOM
  testing decision).

## Open Questions

None — all unknowns were resolved against the codebase. No `NEEDS CLARIFICATION` items
remain.
