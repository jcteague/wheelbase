# ADR: wouter hash routing; query string for form pre-fill, not global state

<!-- generated:from us-5 -->

## Decision

The renderer uses `wouter` with `useHashLocation` (hash-based routing) because Electron loads via `file://` URLs and browser-history routing breaks in packaged builds. For pre-filling forms during cross-page navigation (e.g. "Open new wheel on AAPL" after a CSP expiration), the source page passes context via a query string on the hash route (`#/new?ticker=AAPL`); the destination page reads it via wouter's `useSearch()` and forwards it to the form's `defaultValues`.

No global state library (Zustand, Redux) is introduced for this kind of one-shot navigation context.

## Context / Why

- Electron's packaged renderer loads from `file://`, where browser history doesn't work reliably; hash routing is the standard workaround and is required by CLAUDE.md.
- Query strings are idiomatic for pre-filling forms and survive the navigation natively — no need for an external state store.
- A single string of context ("ticker = AAPL") doesn't justify a global state library; the over-engineering would propagate.

## Alternatives considered

- **Browser history routing** — rejected; breaks in packaged Electron builds (`file://` protocol).
- **Global state library (Zustand) for navigation context** — rejected as over-engineered for one string.
- **React Context API** — rejected for the same reason; the context would only have one consumer (the destination form).
- **Router state object** — fragile in Electron's hash routing implementation.

## Consequences

- `NewWheelPage` reads `?ticker=...` from `useSearch()` and passes `defaultTicker` to `NewWheelForm` for its `useForm({ defaultValues })`.
- Two navigation mechanisms carry the ticker forward: `ExpirationSheet` uses wouter's `navigate(\`/new?ticker=${ticker}\`)`, while `CallAwaySuccess` mutates the hash directly with `window.location.hash = \`#/new?ticker=${ticker}\``. Both land on the same `#/new?ticker=…` route.
- This pattern extends naturally to any other "carry one value to the next page" scenario (e.g. opening a CC after assignment — though that flow happens inline on the same page).

## Sources

- [extract: us-5](../../.extracts/us-5.md) — ADR "Pre-fill ticker via wouter query string, not global state"
- [feature: us-5-expire-csp](../../features/us-5-expire-csp.md)
<!-- /generated -->
