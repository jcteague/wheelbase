# Research: US-101 — Open a PMCC position with two linked opening legs

Story: Linear [OPT-7](https://linear.app/optionswheel/issue/OPT-7/us-101-open-a-pmcc-position-with-two-linked-opening-legs)
(refined 2026-09-26). Mockup: `mockups/us-101-open-pmcc-position.mdx` (story-level) and the
consolidated `mockups/epic-09-pmcc-new-position.mdx` (ownership table + AC states; the sheet as
it looks after US-113 and US-122 also ship). Researched 2026-09-28.

## What already exists (verified against `src/`, not the spec)

| Concern                   | Current state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Consequence for this story                                                                                                                                                                                                                                                                                                                |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `positions.strategy_type` | Column exists (migration 001, default `'WHEEL'`); `StrategyType` enum already has `'PMCC'` (`core/types.ts`). `createPosition` hard-codes `'WHEEL'`. `get-position.ts` returns `strategyType`; `list-positions.ts` does not select it.                                                                                                                                                                                                                                                                                                                                                        | No new column for the discriminator. The list query must start selecting it.                                                                                                                                                                                                                                                              |
| `legs` table              | `leg_role`, `action` (`SELL/BUY/EXPIRE/ASSIGN/EXERCISE`), `instrument_type` (`PUT/CALL/STOCK`), `premium_per_contract` (per-share price), `fill_price`, `fill_date`, `roll_chain_id`. **No fees column.**                                                                                                                                                                                                                                                                                                                                                                                     | Migration 017 adds `fees TEXT NOT NULL DEFAULT '0.0000'`. `BUY`/`CALL` need no enum change; two new `LegRole` values are needed.                                                                                                                                                                                                          |
| `cost_basis_snapshots`    | `basis_per_share`, `total_premium_collected`, `final_pnl`, `trigger_event` (migration 004).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | The opening "initial debit record" is one snapshot row with `trigger_event = 'PMCC_OPEN'`, shaped so US-103's running ledger reproduces it (see ADR). No new table.                                                                                                                                                                       |
| `WheelPhase` enum         | Ten wheel phases; `activeLegSubquery()` (`services/active-leg-sql.ts`) is phase-aware and matches only `CSP_OPEN`/`CC_OPEN`. `evaluate-alerts.ts` selects `phase IN ('CSP_OPEN','CC_OPEN')`; `detect-assignments.ts` selects `phase = 'CSP_OPEN'`.                                                                                                                                                                                                                                                                                                                                            | A new PMCC phase value is invisible to every wheel-only job for free: no active leg, no alert evaluation, no assignment detection. This is the "skip unsupported PMCC processing safely" requirement, and it needs regression tests, not new code.                                                                                        |
| `positions:create`        | Handler takes a typed payload without a Zod parse; `createPosition` calls `openWheel` (pure) then writes three rows in one `db.transaction`. `ivrOnDemand?.collect(ticker)` afterwards (US-100).                                                                                                                                                                                                                                                                                                                                                                                              | Mirror the shape in a sibling `createPmccPosition` service + a parsed `positions:create-pmcc` handler. Do not fold PMCC into `positions:create`: the payloads share nothing but `ticker`.                                                                                                                                                 |
| `handleIpcCall`           | Maps `ZodError` issues to `field: String(issue.path[0] ?? '__root__')`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A nested payload (`long.fillPrice`) would collapse to `field: 'long'`. Change to `issue.path.join('.')` — backward-compatible for every existing single-segment path.                                                                                                                                                                     |
| "Open Wheel" entry        | A **route**, `#/new`, rendered by `NewWheelPage` (full page, breadcrumb). Reached from the sidebar `NavItem`, the list header `+ New Wheel` link, the empty-state link, `CallAwaySuccess` (`#/new?ticker=`), and the US-68 promote (`/new?promoted=1&…`). 14 e2e specs drive it via `location.hash = '#/new'`, `#ticker`, `button[type="submit"]`, then wait for `#ticker` to detach.                                                                                                                                                                                                         | The story's shared sheet replaces the page. Keeping `/new` as the URL that means "positions list with the sheet open" preserves every entry point and every existing spec (see ADR).                                                                                                                                                      |
| `NewWheelForm`            | RHF + Zod, ids `#ticker #strike #contracts #premiumPerContract #expiration #fillDate #thesis #notes`; on success renders an in-form `role="status"` card ("✓ WHEEL OPENED") then navigates to the detail page after 2 s. Promoted mode adds `PromotedFormChrome`.                                                                                                                                                                                                                                                                                                                             | Reused verbatim inside the sheet's Standard mode. Its success behaviour is what `csp-flow.spec.ts` and `promote-to-trade.spec.ts` assert on.                                                                                                                                                                                              |
| Sheet primitives          | `SheetOverlay` (scrim + `left-[200px]`), `SheetPanel({ width })`, `SheetHeader`, `SheetBody`, `SheetFooter`, portal `#sheet-portal` in `App.tsx`. Detail-page sheets use `open` prop + `onClose`.                                                                                                                                                                                                                                                                                                                                                                                             | Reuse as-is. Width 460 (mockup).                                                                                                                                                                                                                                                                                                          |
| Form primitives           | `Field`, `NumberInput`, `FormButton` (primary renders `type="submit"`, secondary `type="button"`; `pendingLabel`/`isPending`), `DatePicker` (`id`, `value`, `onChange`, `hasError`, `aria-label`), `SectionCard` (`headerVariant="emphasized"`), `AlertBox` (`success/error/warning/info`). No `Select` primitive.                                                                                                                                                                                                                                                                            | Contract picker uses a native `<select>` styled with `wb-*` tokens.                                                                                                                                                                                                                                                                       |
| Option chains             | `market-data:option-chain` IPC exists (`GetOptionChainPayloadSchema`: `underlying`, `expirationFrom/To`, `type: 'put'                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 'call'`, `strikeFrom/To`, `limit ≤ 250`) and returns `OptionChainQuote[]`(snapshot +`contractId`, `strike`, `expiration`, `contractType`; `greeks?.delta`, `impliedVolatility?`, `timestamp`). Preload exposes `marketData.optionChain`. **No renderer wrapper or hook uses it yet.** The handler returns `nextCursor: null` — no paging. | Add `getOptionChain` to `api/market-data.ts` and a `useCallChain` hook. Delta filtering is client-side (Alpaca's chain filter has no delta). |
| Fake provider (e2e)       | `FakeMarketDataProvider.getOptionChainSnapshot` serves `WHEELBASE_MOCK_OPTION_SNAPSHOTS` (OCC-keyed JSON, identity parsed from the key) filtered by `underlying`, `type`, `expirationFrom/To`. `FAKE_MARKET_DATA_ERROR=<code>` makes every call throw. No delay knob.                                                                                                                                                                                                                                                                                                                         | Calls with greeks can be seeded. Stale = an old `timestamp` in the fixture. Loading needs a small test-only delay env (see ADR).                                                                                                                                                                                                          |
| DTE                       | Engine `core/dte.ts` `computeDte` and renderer `lib/format.ts` `computeDteFromInput` both count **local** calendar days via `date-fns` (US-68 decision). `lib/format.ts` also has a legacy UTC `computeDte` used by the detail page.                                                                                                                                                                                                                                                                                                                                                          | Use `computeDteFromInput` for the form and `computeDte` (engine) in the list service. The AC's 368 / 32 hold on any US-zone machine for the fixture dates.                                                                                                                                                                                |
| Money                     | `decimal.js`, `ROUND_HALF_UP`, `round4`, 4 dp TEXT. Renderer imports pure engine helpers straight from `main/core` (`PositionCard.tsx` imports `computeUnrealizedPnl` from `core/costbasis`).                                                                                                                                                                                                                                                                                                                                                                                                 | One pure `calculatePmccOpeningDebit` in `core/costbasis.ts`, used by the service **and** the renderer preview. No second implementation.                                                                                                                                                                                                  |
| Sibling stories           | US-103 (OPT-9): running PMCC basis = `long_debits + fees − short_credits ± roll_nets`, persisted to `cost_basis_snapshots` (`basis_per_share` may be negative; `total_premium_collected` = short-call credits to date, after fees; `trigger_event`); "must reproduce $2,302.00 for US-101's fee example". US-119 (OPT-25): "return the LEAPS-only phase US-101 named"; "role names are decided in planning alongside US-101's PMCC leg roles". US-108 supersedes the minimal row; US-118 supersedes the minimal detail; US-113 adds an IV block to this sheet; US-122 adds promote-into-PMCC. | This plan **names** the phases and leg roles (ADR below) and writes the opening snapshot in US-103's convention. It builds nothing for the superseding stories.                                                                                                                                                                           |

## Architecture Decisions

### ADR: `#/new` becomes "positions list with the New position sheet open"

- **Decision:** Keep `/new` as a route, but render it with `PositionsListPage` instead of a
  standalone page. `App.tsx` routes `/` and `/new` to the same component through a single
  RegExp route (`path={/^\/(new)?$/}` — wouter ≥ 3 supports RegExp paths), and the page derives
  `sheetOpen = location === '/new'`. Closing the sheet (Cancel, ×, Escape, scrim, or a PMCC
  success) calls `navigate('/', { replace: true })`. `NewWheelPage.tsx` is deleted; its
  consume-on-mount of the promote query string moves into the sheet. The sidebar `Open Wheel`
  item, the `+ New Wheel` header link, the empty-state link, `CallAwaySuccess` and the US-68
  promote keep their `#/new…` targets untouched.
- **Why:** The story requires the sheet to open _over_ the positions list and to leave the list's
  scroll intact, which a page navigation cannot do. Fourteen e2e specs and five renderer entry
  points already speak `#/new`; the US-122 promote (next story) will need a URL to land on.
  One RegExp route avoids two `<Route>` elements that React might or might not reconcile into
  the same `PositionsListPage` instance — and a unit test proves the list does not remount when
  the hash flips `/` ↔ `/new`, which is also what keeps the post-success banner alive.
- **Alternatives considered:** (a) A pure local-state sheet with no route: breaks every
  `#/new` entry point and the promote handoff. (b) `#/?new=1`: same breakage of 14 specs.
  (c) Two `<Route>` elements to the same component: works if React preserves the instance, but
  the RegExp route removes the question. (d) Keep `NewWheelPage` for promote only: two homes
  for one form, and US-122 would need a third.

### ADR: Standard mode is the shipped `NewWheelForm`, success behaviour included

- **Decision:** In Standard mode the sheet body renders `NewWheelForm` unchanged: same field ids,
  same validation, same promote chrome, same in-form `✓ WHEEL OPENED` status card and 2 s
  redirect to the detail page. Only PMCC mode closes the sheet on success and shows the
  list-level `PMCC recorded — XYZ · LEAPS + short call open` banner with `View position →`.
- **Why:** The story says Standard "retains the existing opening-put workflow" and "Preserve
  existing screener-prefilled standard entry within this shared sheet." `csp-flow.spec.ts` and
  `promote-to-trade.spec.ts` assert on that `[role="status"]` card. The AC only specifies the
  post-success shape for PMCC. Changing the wheel's success UX is a separate story if wanted.
- **Alternatives considered:** Closing the sheet on wheel success with a list banner (the mockup
  does this for both modes): would rewrite six assertions across existing specs for a behaviour
  the AC does not require. Noted as a follow-up, not done here.
- **Watch-out:** with the list rendered underneath, `LoadingState` (`role="status"`) is briefly
  present before data loads, and `AssignmentNotificationBanner` uses `role="status"` when an
  assignment is pending. Neither is present when the existing specs fill the form, but if a spec
  flakes the fix is to scope the selector to the sheet (`[role="dialog"] [role="status"]`),
  not to change the form.

### ADR: PMCC phase and leg-role names (owned here, consumed by US-115/119/120/111)

- **Decision:** Phases carry a `PMCC_` prefix on the shared `WheelPhase` enum:
  `PMCC_OPEN` (LEAPS + short call open — the only value this story adds), and reserved for the
  lifecycle stories: `PMCC_LEAPS_ONLY` (LEAPS open, no short call — US-119 / US-115) and
  `PMCC_CLOSED` (terminal — US-111 / US-120). Leg roles: `LEAPS_OPEN` (action `BUY`,
  instrument `CALL`) and `SHORT_CALL_OPEN` (action `SELL`, instrument `CALL`). Reserved:
  `SHORT_CALL_CLOSE`, `SHORT_CALL_EXPIRED`, `LEAPS_CLOSE`, `SHORT_CALL_ASSIGNED`. Labels:
  `PHASE_LABEL.PMCC_OPEN = 'LEAPS + short call open'` (same string for the short variant).
- **Why:** The story forbids overloading `CC_OPEN`; a prefix keeps SQL `phase IN (…)` filters
  in wheel-only jobs correct by construction; US-119 explicitly defers both names to this plan.
  Only the phase this story creates enters the enum — reserving the rest as names, not code,
  keeps `PHASE_COLOR`/`PHASE_LABEL` records honest (they are `Record<WheelPhase, …>` and would
  need entries for values nothing produces).
- **Alternatives considered:** A separate `PmccPhase` enum and a `phase` union type: touches
  every `Record<WheelPhase, …>` and every `phase ===` comparison for no behavioural gain at this
  stage. Overloading `CC_OPEN` + `strategy_type`: rejected by the story.

### ADR: Per-leg fees live on the leg (`legs.fees`), not on the snapshot

- **Decision:** Migration `017_add_leg_fees.sql`: `ALTER TABLE legs ADD COLUMN fees TEXT NOT NULL
DEFAULT '0.0000'`. `LegRecord.fees: string` (4 dp). Wheel legs keep the default and are never
  written with fees by this story.
- **Why:** US-103 needs "each fee … once, attached to its own leg" for its history rows, and
  US-119 records fees on the buyback. A per-leg column is the only shape that serves both; a
  fees field on the snapshot would lose the per-leg attribution.
- **Alternatives considered:** Folding fees into `premium_per_contract`: hides the fee in the
  fill price and breaks "actual fill" as recorded. A `leg_fees` table: overkill for one number.

### ADR: The opening snapshot is written in US-103's ledger convention

- **Decision:** `createPmccPosition` inserts one `cost_basis_snapshots` row with
  `trigger_event = 'PMCC_OPEN'`, `basis_per_share = initialNetDebit / (contracts × 100)`
  (fees included, 4 dp; $23.0200 for the fee example), and
  `total_premium_collected = shortCredit − shortFees` (dollars, 4 dp; $199.0000 in the fee
  example, $200.0000 in the base example). `snapshot_at = makeSnapshotAt(long.fillDate)`.
- **Why:** US-103 states its running formula "must reproduce $2,302.00 for that example rather
  than adding [fees] a second time" and defines `total_premium_collected` as short credits after
  fees. Writing the entry snapshot in that shape means US-103 extends a chain rather than
  migrating one. `basis_per_share` is per share of contract, the unit US-103 displays.
- **Alternatives considered:** Storing the total debit in `basis_per_share`: wrong unit for
  US-103. Not writing a snapshot: US-103's "first row of the detail history" would not exist,
  and the list's initial-net-debit cell would need its own source.

### ADR: One pure `calculatePmccOpeningDebit`, shared by service and renderer

- **Decision:** Add to `src/main/core/costbasis.ts`:
  `calculatePmccOpeningDebit({ contracts, long: { strike, fillPrice, fees }, short: { strike, fillPrice, fees } })`
  (the leg input is a structural subset of `openPmcc`'s leg, so callers pass their legs through)
  → `{ leapsCost, shortCredit, fees, initialNetDebit, strikeWidthPerShare, debitToWidthPercent, basisPerShare, netDebitBeforeFees }`
  (all 4 dp strings; `debitToWidthPercent` = `(longFill − shortFill) / (short.strike − long.strike) × 100`, fees excluded — `'76.6667'`, displayed as `76.67%`).
  The renderer's `PmccCashFlows` preview imports it from `main/core/costbasis` exactly as
  `PositionCard.tsx` imports `computeUnrealizedPnl` today.
- **Why:** The AC pins five numbers; two implementations would drift. The precedent for
  renderer imports of pure engine code already exists and typechecks under the renderer
  tsconfig.
- **Alternatives considered:** A `src/shared/` copy: the existing precedent is `main/core`.
  Computing the preview in the form with ad-hoc `parseFloat`: the `$2,302.00` / `76.67%` fee
  split is exactly the kind of thing that goes wrong twice.

### ADR: PMCC entry validation is a pure `openPmcc` in `core/lifecycle.ts`, mirrored by the form schema

- **Decision:** `openPmcc(input)` throws `ValidationError(field, code, message)` with the exact
  AC messages and dotted field paths (`long.fillPrice`, `short.expiration`, `short.strike`,
  `contracts`, `__pair__`). The renderer Zod schema (`schemas/pmcc-entry.ts`) enforces the
  field-shape rules (required fill, positive, whole number, non-negative fees, ISO dates) with
  the **same messages**, and the cross-leg rules (ordering, strike, net debit) via
  `superRefine` with the same messages, so the trader sees the error on blur and the boundary
  still rejects a hand-built payload. `handleIpcCall` joins Zod paths with `.` so nested
  payload issues land on the right field.
- **Why:** CLAUDE.md: engines are pure and own the rules; the story: "Use the same validation at
  the main-process boundary." Dotted paths map 1:1 to RHF's nested `setError('long.fillPrice')`.
- **Boundary-only rules:** "Both calls must have the same underlying", "PMCC entry requires two
  call options", "Opening quantities must match", "standard 100-share contracts only" have no
  form field to land beside (ticker and quantity are shared; the chain only serves standard
  calls whose OCC root matches the ticker — `GetOptionSnapshotPayloadSchema`'s regex cannot
  even express an adjusted root). The payload therefore carries per-leg `underlying`,
  `instrumentType`, `contracts` and `deliverableShares`; the form always sends
  `ticker`/`'CALL'`/shared `contracts`/`100`; the engine and the e2e boundary tests cover the
  rejections. The consolidated mockup already records this split.
- **Alternatives considered:** Flat payload with `longStrike`, `shortStrike`, …: loses the
  "explicitly named long and short legs" the story asks for and makes US-104/105 payloads
  inconsistent. Only validating in Zod: cross-leg rules with custom codes cannot be expressed
  (Zod restricts `ctx.addIssue` codes — same reason US-67 split its rules).

### ADR: Call-chain picker — Alpaca chain IPC + client-side delta band + one notice slot per leg

- **Decision:** `useCallChain({ ticker, dteMin, dteMax, deltaMin, deltaMax, strikeBelow|strikeAbove })`
  wraps a TanStack query on `market-data:option-chain` with `type: 'call'`,
  `expirationFrom/To` derived from today + the DTE band, `limit: 250`, `staleTime` 30 s,
  refetch every 60 s (the `useOptionSnapshots` cadence). A pure `filterCallChain` keeps
  contracts whose `greeks.delta` is inside the band (contracts with no greeks are kept at the
  end of the list, labelled `Δ —`, so missing Greeks never hide a structurally valid contract).
  The leg's notice is derived by a pure `deriveChainNotice({ status, error, contracts, selectedQuote, now })`
  returning a kind in priority order — `'loading'`, `'unavailable'`, `'empty'`, `'stale'`
  (selected quote `timestamp` older than 5 min), else `null` — and `chainNoticeMessage` maps
  the kind to its copy (`Loading call contracts…`; `Quotes unavailable. Enter your filled trade
manually.`; `No matching calls. Adjust filters or enter manually.`; `Quote is stale. Verify
against your actual fill.`), the `derivePromoteBanner` / `promoteBannerMessage` split. Selecting a contract writes only `strike` and `expiration`
  into the form; the quote block reads from the latest chain result and shows `—` for any
  missing figure; `Enter manually` clears the selection and unlocks the two fields. Changing
  the ticker resets both legs' selections and fill prices.
- **Why:** The provider abstraction is already behind this IPC; nothing in the renderer may
  talk to a vendor. Alpaca's chain filter has no delta parameter, so delta is a view filter.
  The 5-minute staleness threshold is the one the detail page already uses
  (`SNAPSHOT_STALE_THRESHOLD_MS`), and it makes "stale" mean the same thing in and out of
  market hours (a closed-market snapshot is always old).
- **Size risk:** the IPC returns one page (`nextCursor: null`) of at most 250 contracts. A
  180+ DTE call window on a liquid name can exceed that. Mitigation in the hook: when the
  underlying's live price is known (`useStockQuotes([ticker])`), pass `strikeTo = price` for
  the LEAPS band and `strikeFrom = price` for the short band, halving each request; without a
  price, request unbounded and accept truncation. Paging the chain is out of scope (it is a
  provider-side concern US-64 did not need either).
- **Alternatives considered:** Reusing `services/candidate-chains.ts` (screener pull): it is
  watchlist-shaped, batch, and put-only by configuration. A single-contract re-quote via
  `usePromotedQuote`: right for US-122's promote, not for browsing a chain.

### ADR: Draft retention across the toggle — both forms stay mounted, one imperative shared-field handle

- **Decision:** `NewPositionSheet` renders both `NewWheelForm` and `PmccEntryForm` from the
  first open and hides the inactive one with the `hidden` attribute, so each RHF instance keeps
  its draft. Each form exposes `{ getShared(): { ticker, contracts }, setShared(v) }` through
  `useImperativeHandle`; on toggle the sheet copies the outgoing form's ticker/contracts into
  the incoming form. Each form is its own `<form>`, so a hidden form is never submitted and
  its fields never reach the other strategy's payload. The toggle is disabled while either
  mutation is pending. Cancel / × / Escape / scrim close via the route and drop both drafts;
  reopening starts fresh in Standard. A failed PMCC save keeps the sheet, the mode and the draft.
- **Why:** "each strategy's draft retained for switching back" + "shared ticker and quantity
  remain available" with the least machinery: no lifted form state, no duplicated schemas, and
  `NewWheelForm` gains one optional ref prop rather than a rewrite.
- **Alternatives considered:** Lifting ticker/contracts into the sheet as controlled inputs:
  forces `NewWheelForm` to give up ownership of two of its fields and breaks its promote
  defaults. Unmount-and-remount with a saved snapshot: more code for the same effect.

### ADR: Test-only chain delay in the fake provider

- **Decision:** `FakeMarketDataProvider.getOptionChainSnapshot` honours
  `FAKE_OPTION_CHAIN_DELAY_MS` (default 0) before answering. Nothing else changes.
- **Why:** The `Loading call contracts…` AC is otherwise a race in e2e. The fake provider is
  already the seam for `FAKE_MARKET_DATA_ERROR`, `FAKE_MARKET_STATUS`, and calendar faults.
- **Alternatives considered:** Asserting the loading notice only in a component test: leaves an
  AC without a falsifiable e2e; a 2-second delay on every fixture: slows every other spec.

### ADR: Storage-failure e2e uses a read-only DB file, not a code seam

- **Decision:** The "Recover from a failed save" e2e launches the app on a temp DB, fills the
  PMCC form, then `chmod 0o444`s the DB file (and its `-wal`/`-shm` siblings if present)
  before clicking `Record PMCC`; SQLite raises `SQLITE_READONLY` inside the transaction, the
  handler returns `internal_error`, and the form shows the recovery message. The spec restores
  permissions in `afterEach`.
- **Why:** No test-only IPC or service flag is needed; the failure is a real storage failure
  through the real path, and atomicity ("neither an incomplete PMCC nor a standalone opening
  leg") is asserted by listing positions afterwards. `better-sqlite3` respects file
  permissions on macOS and Linux.
- **Alternatives considered:** A `_test:fail-next-write` handler: leaks test control into the
  service. Dropping the `legs` table via a test IPC: would also break the list.

### ADR: List and detail surfaces get a PMCC branch, wheel code paths are untouched

- **Decision:** `PositionListItem` becomes the union `WheelListItem | PmccListItem`,
  discriminated on `strategyType`, where only the PMCC arm carries
  `pmcc: PmccListSummary` (`{ long: { strike, expiration, dte, contracts }, short: {…}, initialNetDebit }`)
  and the wheel arm has `pmcc: null` — the `IpcIvRankPair` exactly-one-arm pattern, so a
  `'WHEEL'` item with a summary or a `'PMCC'` item without one cannot be built. The summary is
  filled by one extra query in `listPositions` for PMCC ids. The PMCC arm types
  `expiration: null`, `strike: null`, `instrumentType: null`, `entryPremiumPerContract: null`
  so the calendar (filters `expiration != null`), `useOptionSnapshots` (needs
  `instrumentType`) and `deriveRowDisplay` (needs `entryPremiumPerContract`) skip it without
  a branch. `PositionRow` delegates to `PmccPositionRow` when `item.pmcc` is set (same
  `<tr>` test id, `PMCC` badge, `LEAPS + short call open`, two labelled expiration/DTE lines,
  `$2,300.00 net debit` in the cost-basis column, `—` in Opt Mid / P&L). `PositionCockpit`
  renders `PmccLegReference` (two `SectionCard`s + initial net debit + "Live P&L unavailable
  until PMCC valuation ships") when `position.strategyType === 'PMCC'`; `PositionDetailContent`
  hides `PositionAlertOverridesForm` for PMCC (profit-target overrides are a wheel concept).
  `PositionDetailActions` shows only the phase badge for `PMCC_OPEN` (no phase matches, no
  code change beyond the label).
- **Why:** "Only show the new PMCC on surfaces that can handle its strategy." US-108 and US-118
  replace these minimal views; they must be truthful now and cheap to delete later.
- **Alternatives considered:** Populating `expiration` with the short call's date so the
  calendar shows it: the calendar would then render a PMCC through wheel copy ("CC expiring")
  — deferred to a calendar story.

## Open Questions

None blocking. Two items are recorded as accepted assumptions rather than clarifications:

- **DTE basis.** The story asks for an explicit America/New_York valuation date. The codebase's
  established basis is local calendar days via `date-fns` (US-68 chose it so the form and the
  screener agree). This plan keeps that basis and says so in the form's hint code; the fixture
  dates produce 368 / 32 on any US-zone machine. Switching the whole app to an ET basis is a
  cross-cutting change outside this story.
- **`total_premium_collected` sign/scope on the PMCC opening snapshot** follows US-103's text
  ("short-call credits to date, after fees", dollars). If US-103's planning changes that unit,
  the one insert in `createPmccPosition` is the only place to adjust.
