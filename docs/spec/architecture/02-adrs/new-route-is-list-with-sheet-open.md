# ADR: `#/new` is the positions list with the New position sheet open

<!-- generated:from us-101 -->

## Decision

`#/new` stays a route, but it renders `PositionsListPage` rather than a page of its own. `App.tsx` maps both `/` and `/new` to the same component through **one RegExp route** (`/^\/(new)?$/`), and the page derives `sheetOpen` from `location === '/new'`. Closing the `NewPositionSheet` (Cancel, ×, Escape, scrim, or a PMCC success) navigates to `/` with `replace: true`.

`NewWheelPage.tsx` (and its test) is deleted; its consume-on-mount of the promote query string moved into the sheet. Every existing entry point keeps its `#/new…` target: the sidebar `Open Wheel` item, the `+ New Wheel` header link, the empty-state link, `CallAwaySuccess`, and the US-68 promote handoff.

As shipped:

- The page **does not remount** across `/` ↔ `/new`, which keeps the recorded banner alive and the list's scroll position intact.
- Closing the sheet **refetches nothing**. A successful save inserts the recorded row into the cached `['positions']` list (`setQueryData` + `sortPositionsByDte`), so a 100+ position list is never re-read just to show one new row.
- Focus returns to **whichever element opened the sheet** (sidebar item, header link, empty-state link), falling back to the header trigger.

## Context / Why

- The sheet has to open _over_ the list and leave its scroll position alone. Navigating to another page cannot do that.
- Fourteen e2e specs and five renderer entry points already use `#/new`, and US-122's promote handoff needs a URL to land on. Keeping the route means none of them change.
- With a single RegExp route, nobody has to ask whether two `<Route>` elements reconcile into the same component instance.

## Alternatives considered

- **Local-state sheet with no route.** Rejected: it breaks every `#/new` entry point and the promote handoff.
- **`#/?new=1`.** Rejected for the same reason.
- **Two `<Route>` elements pointing at the same component.** Rejected: it leaves reconciliation and remount behaviour ambiguous.
- **Keep `NewWheelPage` for promote only.** Rejected: one form would have two homes.

## Consequences

- Any "open the new-position flow" link is still just `#/new`, optionally with a query string. The [wouter-hash-routing-query-prefill](./wouter-hash-routing-query-prefill.md) pre-fill convention still applies, but the sheet reads the query string now, not a page.
- Nothing refreshes the list on close, so any new path that writes positions must update the `['positions']` cache itself. E2e specs that used a `#/new` hop to force a remount now use `reloadPositionsList` (a real hop through `#/watchlist`).
- With the list rendered underneath, more `role="status"` elements share the page. See [standard-mode-is-new-wheel-form](./standard-mode-is-new-wheel-form.md) for the spec-scoping watch-out.

## Sources

- [extract: us-101](../../.extracts/us-101.md)
- [feature: us-101-open-pmcc-position](../../features/us-101-open-pmcc-position.md)
<!-- /generated -->
