---
page: docs/spec/architecture/02-adrs/wouter-hash-routing-query-prefill.md
audited_at: 2026-06-27
findings: 1
---

# Audit: wouter-hash-routing-query-prefill.md

## Verified (5)

- ✓ Renderer uses wouter with `useHashLocation` — `src/renderer/src/App.tsx:3` imports it from `wouter/use-hash-location`; `App.tsx:95` `<Router hook={useHashLocation}>`.
- ✓ `NewWheelPage` reads the query string via `useSearch()` — `src/renderer/src/pages/NewWheelPage.tsx:1,14`.
- ✓ Derives `defaultTicker` from `?ticker=` — `NewWheelPage.tsx:15` (`new URLSearchParams(search).get('ticker')`).
- ✓ Forwards `defaultTicker` to the form — `NewWheelPage.tsx:20` (`<NewWheelForm navigate={navigate} defaultTicker={defaultTicker} />`).
- ✓ No global state library (Zustand/Redux) introduced for this — `grep` finds no zustand/redux usage for nav context.

## Drift (1)

- ✗ The page states "The post-CSP-expiration success state navigates with `navigate('/new?ticker=' + ticker)`." The actual call sites diverge: `src/renderer/src/components/ExpirationSheet.tsx:55` uses `navigate(\`/new?ticker=${ticker}\`)` (template literal), and `src/renderer/src/components/CallAwaySuccess.tsx:127` sets `window.location.hash = \`#/new?ticker=${ticker}\``(direct hash mutation, not`navigate()`). Suggested fix: note the two mechanisms (wouter `navigate`in ExpirationSheet, direct`location.hash`in CallAwaySuccess) rather than a single`navigate()` form.

## Unverifiable (1)

- ? "browser-history routing breaks in packaged Electron builds (file://)" — environment/runtime narrative; flag for human review (it is also a CLAUDE.md architecture rule).

## Missing files (0)

None within src/ scope.
