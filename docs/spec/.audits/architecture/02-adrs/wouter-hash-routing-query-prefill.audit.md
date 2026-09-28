---
page: docs/spec/architecture/02-adrs/wouter-hash-routing-query-prefill.md
audited_at: 2026-09-28
findings: 2
---

# Audit: wouter-hash-routing-query-prefill.md

## Verified (6)

- ✓ wouter with `useHashLocation` — `src/renderer/src/App.tsx:3,118`.
- ✓ `NewWheelPage` reads `?ticker=` via `useSearch()` — `src/renderer/src/pages/NewWheelPage.tsx:2,16,25`.
- ✓ Passes `defaultTicker` to `NewWheelForm`, which feeds `useForm` defaults — `NewWheelPage.tsx:42`; `NewWheelForm.tsx:60,67,91`.
- ✓ `ExpirationSheet` navigates via `navigate(\`/new?ticker=${ticker}\`)`—`src/renderer/src/components/ExpirationSheet.tsx:56`.
- ✓ `CallAwaySuccess` sets `window.location.hash = \`#/new?ticker=${ticker}\``—`src/renderer/src/components/CallAwaySuccess.tsx:127`.
- ✓ Links `../../.extracts/us-5.md` and `../../features/us-5-expire-csp.md` exist.

## Drift (1)

- ✗ Page says "No global state library (Zustand, Redux) is introduced" (line 9). `zustand` is a declared dependency — `package.json:57` (`"zustand": "^5.0.11"`) — although `grep "from 'zustand'"` finds no import in `src/`, so it is not used for navigation context (or anything). The scoped claim ("for this kind of one-shot navigation context") holds; the dependency is unused. Suggested fix: note the unused dependency, or remove it from `package.json`.

## Unverifiable (1)

- ? Rationale (router state fragile in hash routing; Context API rejected) — narrative.

## Missing files (0)

None.
