# Research: US-33 — Option price + unrealized P&L for open legs

This document records decisions made before Phase 1 / 2. Each topic resolves an unknown raised by the user story or the existing codebase.

---

## Mockup file

- **Decision:** No mockup file exists at `mockups/us-33-option-price-unrealized-pnl.mdx` despite the user story referencing one. Plan the UI from the textual AC + existing `mockups/us-32-live-underlying-price.mdx` patterns (mono font, two-line table cells, `wb-*` design tokens, table cell layout, `Caption + StatGrid` for the detail page).
- **Rationale:** The story's Gherkin already specifies every visible value, color, and tooltip text needed; the US-32 mockup gives the visual idiom for the table cell. No mockup is blocking.
- **Alternatives considered:** Pause and request a mockup from product. Rejected — the AC text is concrete enough (every dollar amount, every label, every color is explicit), and the dashboard pattern is already established by US-32.

---

## OCC option symbol format

- **Decision:** Build OCC symbols in the form `{TICKER}{YYMMDD}{P|C}{STRIKE_8}` where `STRIKE_8` is the strike multiplied by 1000 and zero-padded to 8 digits. Example: AAPL `2026-05-16` `$180.00` PUT → `AAPL260516P00180000`.
- **Rationale:** Matches the format already used in `src/main/integrations/alpaca-market-data.test.ts:259` and accepted by `provider.getOptionSnapshots()`. Industry standard.
- **Alternatives considered:** Storing a `contract_id` column on `legs` to avoid recomputation. Rejected for this story — pure derivation is simpler and there's no caching benefit at our scale.
- **Edge cases handled by `buildOccSymbol`:**
  - Strike must be positive and finite; throw on invalid input.
  - Strike supports up to 4 decimal places (e.g., `180.5` → `00180500`).
  - Expiration parsed from `YYYY-MM-DD`; throw on malformed input.
  - Instrument type must be `'PUT'` or `'CALL'`; `'STOCK'` is invalid here.
  - Ticker is uppercased and trimmed.

---

## Profit-target storage

- **Decision:** Add nullable `profit_target_percent INTEGER` column to `positions` table via migration `005_add_profit_target_percent.sql`. The "global default" is a hard-coded constant `DEFAULT_PROFIT_TARGET_PERCENT = 50` in a new `src/main/core/profit-target.ts` module. No app-settings table is introduced for this story.
- **Rationale:** The story explicitly defers configurable settings UI (no AC mentions changing the default). A constant satisfies every AC; per-position override satisfies the "AAPL has a per-position profit target of 25%" scenario.
- **Alternatives considered:**
  1. Create an `app_settings` key/value table now. Rejected — adds storage and IPC surface for a feature without a story.
  2. Read the default from an env var. Rejected — no end-user control without a setting, and a constant is more discoverable in code.
- **Future-proofing:** When configurable settings ship, the constant is replaced by a settings lookup; no other code needs to change because the resolver is centralized.

---

## Where to compute the profit-target threshold check

- **Decision:** In a pure helper `resolveProfitTarget(positionOverride: number | null): number` exported from `src/main/core/profit-target.ts`. The renderer derives the boolean `targetReached` from `pnlPercent >= resolveProfitTarget(positionOverride)` after the engine returns the P&L.
- **Rationale:** Pure, testable, and the renderer already has the entry premium and current mid (so it can call `computeUnrealizedPnl` without an extra IPC round-trip).
- **Alternatives considered:** Compute server-side and ship `targetReached` over IPC. Rejected — it would require IPC every time prices update, defeating the point of streaming/polling on the renderer.

---

## P&L math (`computeUnrealizedPnl`)

- **Decision:** Add `computeUnrealizedPnl({ entryPremium, currentMid, contracts })` to `src/main/core/costbasis.ts`. Returns `{ pnl, pnlPercent, maxProfit }` — all strings, all formatted to 4dp via `Decimal.toFixed(4)` to match the existing engine convention.
- **Formula:**
  - `maxProfit = entryPremium × contracts × 100`
  - `pnl = (entryPremium − currentMid) × contracts × 100`
  - `pnlPercent = (pnl / maxProfit) × 100` (so 50% target → `50.0000`, not `0.5`)
- **Rationale:** Matches the sign convention in the AC (positive when option decayed). Keeping `pnlPercent` as a percentage 0–100 (not 0–1) matches the story's `50` and `25` thresholds.
- **Alternatives considered:** Returning numbers instead of strings. Rejected — engine convention is decimal-string (basisPerShare, totalPremiumCollected, finalPnl all return strings).
- **Edge cases:**
  - `currentMid = 0` → P&L = entryPremium × contracts × 100; pnlPercent = 100.
  - `currentMid > entryPremium` → P&L is negative; pnlPercent is negative; `targetReached` is false.

---

## Polling cadence for option snapshots

- **Decision:** Use TanStack Query `refetchInterval: 60_000` for `useOptionSnapshots(legs)` — same as `useStockQuotes`. Disable when there are no active option contract IDs, when market session is `'closed'`, or when the page is hidden.
- **Rationale:** Matches the story's "polls on the same interval as stock quotes" note. Aligns with US-32 cadence.
- **Alternatives considered:**
  1. Stream option quotes through the existing WebSocket bridge (the provider has `optionQuotes` feed). Rejected for this story — Alpaca's snapshot endpoint already returns Greeks, the streaming feed only carries quote updates without Greeks. US-34 (Greeks display) is the next story; once it lands, option-quote streaming is more compelling.
  2. Match US-32's `staleTime: Infinity` + stream merge. Rejected — REST polling is simpler and ample for a 60s cadence.
- **Note:** Stream support for option snapshots is intentionally out of scope.

---

## Spread-warning threshold

- **Decision:** A pure helper `isWideSpread({ bid, ask, mid })` returns `true` when `(ask − bid) / mid > 0.10` and `mid > 0`. When `mid === 0`, return `false` (no warning — the "no bid" indicator handles that case).
- **Rationale:** Threshold is fixed by the story, not configurable.
- **Alternatives considered:** A per-position override. Rejected — out of scope.

---

## "No bid" indicator

- **Decision:** A pure helper `hasNoBid({ bid })` returns `true` when `bid === '0'` or `bid === '0.00'` (parsed by Decimal). The PriceCell-equivalent ("OptMidCell") shows a small gray "no bid" sub-label below the mid when this is true.
- **Rationale:** Matches the AC: "and a 'no bid' indicator appears" without specifying exact icon. A textual sub-label is consistent with how `unavailable` already renders below the dash in `PriceCell`.

---

## How to know which positions have an open option leg

- **Decision:** Extend the `PositionListItem` returned by `positions:list` to include `instrumentType: 'PUT' | 'CALL' | null` (joined from the active leg). When `instrumentType` is null (HOLDING_SHARES, WHEEL_COMPLETE, etc.) the renderer shows `—` for both Opt Mid and P&L without ever building an OCC symbol.
- **Rationale:** The active-leg subquery already exists in `list-positions.ts`; adding the option_type/instrument_type column to the SELECT is trivial and avoids a second query in the renderer.
- **Alternatives considered:** Compute "is open option" purely from `phase`. Rejected — coupling on phase is fragile (e.g., new phases in the future); the leg's `instrument_type` is the authoritative signal.

---

## Renderer data flow for option snapshots

- **Decision:** A new `useOptionSnapshots(legs: ActiveLegSummary[])` hook builds OCC symbols from active legs, calls `getOptionSnapshots(symbols)` via REST, and returns `Record<symbol, OptionSnapshot>`. The PositionsListPage extracts `ActiveLegSummary[]` from the position list (ticker + strike + expiration + instrumentType + contracts + entryPremium).
- **Rationale:** Mirrors `useStockQuotes(tickers)` shape; same query-key pattern, same error envelope.
- **Alternatives considered:** Pass legs in directly to the IPC layer (server builds OCC). Rejected — symbol building is pure and the renderer already has every input it needs.

---

## Per-position profit-target override entry

- **Decision:** This story does NOT add a UI to set the per-position override. The migration adds the column and the engine reads it; the override is settable only via a future ticket (or via direct SQL during dev). The AC scenario "the AAPL position has a per-position profit target of 25%" is verified by seeding the column directly in the test.
- **Rationale:** No AC describes the _act_ of setting the override — only the result of having one set. Editing UI is out of scope.

---

## OCC symbol building location

- **Decision:** New file `src/main/core/option-symbol.ts` exporting `buildOccSymbol(input: { ticker, expiration, strike, instrumentType })`. Pure, deterministic, used by the renderer too via re-export.
- **Rationale:** Per CLAUDE.md, `src/main/core/` is for pure engines. A renderer copy would duplicate logic. The renderer can import from `src/main/core/` since core has no DB/Electron imports — it's a leaf module.
- **Alternatives considered:** Place in `src/renderer/src/lib/`. Rejected — duplicating in main+renderer leads to drift; symbol format is a domain rule, not a UI concern.

---

## All unknowns resolved — proceed to Phase 1.
