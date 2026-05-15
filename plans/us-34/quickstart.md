# Quickstart: US-34 — Position Cockpit

## Prerequisites

US-31 (MarketDataProvider) and US-33 (option snapshot polling) must be complete. Both are ✅.

## One-time setup

Install the shadcn Collapsible component (needed for `CollapsedDrawer`):

```bash
cd /Users/johnteague/my-stuff/wb-35
pnpm dlx shadcn@latest add collapsible
```

This adds `src/renderer/src/components/ui/collapsible.tsx`.

## Running the tests for this story

```bash
# Unit tests — run all or target specific files
pnpm test

# Target just the new verdict logic
pnpm test -- verdict

# Target the cockpit component tests
pnpm test -- position-cockpit

# Target the page-level integration tests (includes previously-broken tests)
pnpm test -- PositionDetailPage
```

Expected: all pass, including the 6 verdict branches, TIGHT badge, gamma amber, and the updated PositionDetailPage assertions.

## TypeScript check

```bash
pnpm typecheck
```

No errors expected after implementing all areas.

## Verifying the full post-change checklist

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm format
```

## Manual smoke test

```bash
pnpm dev
```

Navigate to any position with an active option leg → confirm:

- VerdictBlock shows ticker, phase pill, verdict pill, sub-reason
- If snapshot present: P&L % captured bar visible on the right
- RiskSnapshot card shows delta gauge + distance thermometer
- ContextStrip shows Theta / IV / Vega / Gamma
- "Leg reference" and "Cost basis & history" drawers are collapsed by default; click opens them
- Notes, CloseCspForm, closed-position banner still appear below the cockpit

Navigate to a HOLDING_SHARES position → confirm:

- VerdictBlock shows "NO ACTIVE LEG" with sky accent
- RiskSnapshot, ContextStrip, and Leg reference drawer are not rendered
- Cost basis & history drawer is open by default showing Effective Basis + Premium Collected
