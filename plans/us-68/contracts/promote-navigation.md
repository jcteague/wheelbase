# Contract: promote-navigation (hash query string)

> **Not an IPC handler.** US-68 adds no IPC surface — this is the cross-page contract
> between `ScreenerPage` (producer) and `NewWheelPage` (consumer), carried on the wouter
> hash route per the wouter-hash-routing-query-prefill ADR. It is documented in the IPC
> contract format because it is the story's only interface boundary.

## Purpose

Carry one screener candidate (plus its quote provenance and optional watchlist-note
thesis) into the new-wheel form as one-shot, editable defaults.

## Request

Navigation target produced by `buildPromoteSearch(candidate, note?)` in
`src/renderer/src/lib/promote.ts`:

```typescript
// #/new?promoted=1&ticker=AAPL&strike=180&expiration=2026-08-21
//       &premium=2.70&quotedAt=2026-08-07T20%3A00%3A02Z[&thesis=<encodeURIComponent>]

type PromoteSearchParams = {
  promoted: '1' // discriminator — absent on the plain ?ticker= flows
  ticker: string // uppercase ticker
  strike: string // Decimal-normalized ('180.0000' → '180')
  expiration: string // YYYY-MM-DD
  premium: string // the promoted mark, 2dp, verbatim ('2.70')
  quotedAt: string // ISO instant of the screener quote
  thesis?: string // watchlist note, URL-encoded; omitted when absent
}
```

## Response (success)

`parsePromotedParams(search)` in the same module returns the validated payload the page
hands to `NewWheelForm`:

```typescript
type PromotedCandidate = {
  ticker: string
  strike: string
  expiration: string
  premium: string
  quotedAt: string
  thesis?: string
}
// or null — not a promote navigation, or params failed validation
```

## Error codes

| field    | code | message                                                                                                                                                                                                      |
| -------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| _(none)_ | —    | No IPC envelope applies. Malformed or incomplete `promoted` params are not an error state: `parsePromotedParams` returns `null` and the page renders the plain form (honoring a bare `?ticker=` if present). |

## Source

- Producer: `src/renderer/src/pages/ScreenerPage.tsx` / `src/renderer/src/components/ScreenerResultsTable.tsx` (Promote button → `navigate('/new?' + buildPromoteSearch(...))`)
- Codec: `src/renderer/src/lib/promote.ts` (`buildPromoteSearch`, `parsePromotedParams`)
- Consumer: `src/renderer/src/pages/NewWheelPage.tsx` → `NewWheelForm` `promoted` prop
