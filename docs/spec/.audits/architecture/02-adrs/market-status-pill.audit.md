---
page: docs/spec/architecture/02-adrs/market-status-pill.md
audited_at: 2026-06-27
findings: 3
---

# Audit: market-status-pill.md

## Verified (5)

- ✓ `MarketStatusPill` renders four states `LIVE | EXT | CLOSED | DELAYED` — `src/renderer/src/components/MarketStatusPill.tsx:3`.
- ✓ LIVE uses pulse, others do not: `animate-wb-pulse` applied only when `state === 'LIVE'` — `src/renderer/src/components/MarketStatusPill.tsx:29,35`.
- ✓ `useMarketStatus()` polls with `refetchInterval: 60_000`, `staleTime: 30_000`, `refetchOnWindowFocus: true` — `src/renderer/src/hooks/useMarketStatus.ts:6,7,14-16`.
- ✓ Provider returns `{ isOpen, nextOpen, nextClose, session: 'regular'|'pre'|'post'|'closed' }` — `src/preload/index.d.ts:219-224`, `src/main/integrations/alpaca-broker.ts:201-204`.
- ✓ `deriveMarketStatusDisplay()` is a pure function in `src/renderer/src/lib/market-status.ts:18`.

## Drift (3)

- ✗ Page (line 16, 35) claims `deriveMarketStatusDisplay({ session, streamError, dataUpdatedAt })` takes an object with `streamError` and `dataUpdatedAt`. Actual signature is `deriveMarketStatusDisplay(session, stale)` — two positional args, a session and a boolean `stale` — `src/renderer/src/lib/market-status.ts:18-21`. The DELAYED precedence is collapsed into the single `stale` boolean (`if (stale) return 'DELAYED'`); the function does not see `streamError` or `dataUpdatedAt`. Suggested fix: update the signature and the precedence description.
- ✗ Page (line 36) claims hardcoded pill colours `green #3fb950 (LIVE), amber #e6a817 (EXT/DELAYED), gray #6e7681 (CLOSED)`. Actual pill uses Tailwind `wb-*` tokens, not hex: `bg-wb-green` / `bg-wb-gold` / `bg-wb-text-secondary` — `src/renderer/src/components/MarketStatusPill.tsx:10-20`. (Hardcoded hex would also violate the CLAUDE.md Tailwind-token rule.) Suggested fix: replace the hex list with the wb-token mapping.
- ✗ Page (line 36) claims the pulse is `@keyframes wb-pulse` defined in `src/renderer/src/index.css`. The component applies it via the Tailwind utility class `animate-wb-pulse` (`MarketStatusPill.tsx:35`), not an inline keyframes reference. (The keyframes may exist in the Tailwind config/css, but the page's framing is inaccurate.) Suggested fix: describe `animate-wb-pulse` utility usage.

## Unverifiable (1)

- ? "The pill renders on both the positions list header and the position detail header — same component, same data" — placement claim across pages; not mechanically traced here. Flag for human review.
