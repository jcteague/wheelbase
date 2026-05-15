# Research: US-34 — Position Cockpit (Triage Cockpit) Redesign

All unknowns resolved; no NEEDS CLARIFICATION items remain.

---

## Underlying price source

- **Decision:** `useStockQuotes([position.ticker])` from US-32 — already ships `StockQuote.price: string` per poll.
- **Rationale:** `OptionSnapshot` does not carry `underlyingPrice`. The Alpaca option-snapshot API omits the underlying; the stock-quote stream (US-32) is the correct source and is already wired.
- **Alternatives considered:** Deriving from Greeks (not reliable) or adding a field to `OptionSnapshot` (would require backend change out of scope).
- **Implication:** `PositionCockpit` gains a new `underlyingPrice?: string | null` prop. `PositionDetailContent` gains the same prop and calls `useStockQuotes` to derive it (or the page passes it down). The `PositionDetailPage` is the right place to call `useStockQuotes` alongside `useOptionSnapshots`, then pass the price down.

---

## IV source

- **Decision:** Use `snapshot.greeks.iv` — the `OptionGreeks` type already has `iv: string`.
- **Rationale:** The handoff's `PositionCockpit.tsx` incorrectly references `snapshot.impliedVolatility`, which does not exist on `OptionSnapshot`. The real field is at `snapshot.greeks.iv`.
- **Alternatives considered:** None — the correct field is already present.

---

## SANS font token

- **Decision:** Use Tailwind `font-sans` class directly; do not add `SANS` to `lib/tokens.ts`.
- **Rationale:** CLAUDE.md requires Tailwind utility classes. `font-sans` is the standard Tailwind class for the system sans-serif stack. Adding a parallel `SANS` constant to `tokens.ts` would only enable inline `style={{ fontFamily: SANS }}` which violates the no-inline-style rule.
- **Alternatives considered:** Adding `export const SANS = "..."` to tokens.ts — rejected because it would only be used for inline styles.

---

## Inline `style` vs. Tailwind for dynamic colors

- **Decision:** Inline `style` is acceptable **only** for values that are truly dynamic at runtime and cannot be expressed as a Tailwind class:
  - `VerdictBlock` container gradient: `background: linear-gradient(... color-mix(in srgb, ${verdict.color} 12%, ...) ...)` — verdict.color is a runtime CSS variable reference (e.g. `var(--wb-red)`), not a fixed token.
  - `VerdictBlock` verdict pill / phase pill border/background: same reason.
  - `DeltaGauge` SVG `stroke` attribute: runtime severity color.
  - `DistanceThermo` underlying marker `left` and `background`: runtime `dist.pct` value and severity color.
  - `PnlBar` fill `width` and `background`: runtime pnl.pct value and color.
- All static layout (padding, border-radius, flex, grid, font, letter-spacing) must use Tailwind utility classes.

---

## CollapsedDrawer implementation

- **Decision:** Install shadcn `Collapsible` via `pnpm dlx shadcn@latest add collapsible`, then wrap it in a `CollapsedDrawer` component.
- **Rationale:** CLAUDE.md says prefer shadcn/ui. The Collapsible primitive provides accessible keyboard toggle and `aria-expanded` for free.
- **Alternatives considered:** Native `useState` + conditional render (handoff approach) — works but bypasses the shadcn preference.

---

## Where Notes / CloseCspForm / closed-position banner live after the refactor

- **Decision:** Keep them in `PositionDetailContent.tsx` below the new `<PositionCockpit>` render. `PositionDetailContent` is not deleted — it becomes a thin wrapper that renders PositionCockpit + preserved below-fold elements.
- **Rationale:** Minimises diff to `PositionDetailPage.tsx` (the overlay, sheet wiring, and breadcrumb stay unchanged). `PositionDetailContent` retains its existing role as the "inner body" and continues to carry `overlayOpen` blurring.

---

## Leg history table placement

- **Decision:** Move `<LegHistoryTable>` into the "Cost basis & history" `CollapsedDrawer` inside `PositionCockpit`.
- **Rationale:** AC-7 specifies it: "Leg history table renders inside this drawer when expanded." The `detail` prop already carries `legs` and `allSnapshots`, so `deriveRunningBasis` can be called inside `PositionCockpit`.

---

## greeks.iv and greeks fields — string vs. number

- **Decision:** `OptionGreeks` fields (`delta`, `gamma`, `theta`, `vega`, `iv`) are all `string` in the existing type. `PositionCockpit` must call `parseFloat()` on each before passing to `CockpitInput`.
- **Rationale:** The type at `src/renderer/src/api/market-data.ts` is `OptionGreeks = { delta: string; gamma: string; theta: string; vega: string; iv: string }`. The handoff already does `parseFloat()` for delta/theta/gamma/vega but incorrectly uses `snapshot.impliedVolatility` for iv — fix to `parseFloat(snapshot.greeks.iv)`.

---

## Existing PositionDetailPage.test.tsx tests that will break

The following test cases in `PositionDetailPage.test.tsx` assert UI text that moves or changes in the cockpit:

- "Current Mid" stat → moves to "Leg reference" CollapsedDrawer (collapsed by default — text not visible in DOM)
- "Unrealized P&L" stat → replaced by P&L captured% display in VerdictBlock
- "% of Max Profit" stat → replaced by "% captured" in VerdictBlock PnlSummary
- "renders leg history section with two legs in order" → leg history moves inside "Cost basis & history" drawer
- "leg history table shows running cost basis column header" and related → same

These must be updated in Area 10 (wiring) to check the new cockpit UI structure. No tests are deleted — they are updated to match the new component layout.
