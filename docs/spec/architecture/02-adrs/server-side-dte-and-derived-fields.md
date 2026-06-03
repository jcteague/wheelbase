# ADR: Server-side computation of DTE and derived fields

<!-- generated:from us-2 -->

## Decision

Days-to-expiration (DTE) and other derived fields are computed in the main process (the IPC service) and returned in the response, not computed in the renderer from the expiration date. DTE for closed/expired positions (no active option) is returned as `null`; the renderer renders `null` as `"Expired"`.

The positions list is sorted server-side by `dte ASC, nulls last` so the trader sees positions in management-priority order without client-side resorting.

## Context / Why

- DTE is a function of `today` and `expiration` — both server-known values. Computing it server-side gives the renderer a single integer (or `null`) to render directly.
- Sorting server-side keeps the API authoritative; the renderer doesn't have to re-sort and risk drifting from the server's order.
- Returning `null` (not a negative DTE or a string `"Expired"`) keeps the type contract clean: `dte: number | null`.
- For a single-user app with < 100 positions, eager-load via `selectinload` (the FastAPI-era equivalent of a one-shot join) is sufficient; no need for SQL `ROW_NUMBER` window functions.

## Alternatives considered

- **Client-side DTE computation** — rejected because the story explicitly says "computed server-side from expiration date" and because today's date drifts across timezones.
- **DB-computed column for DTE** — rejected; no migration warranted for a derived value that depends on `today`.
- **Return negative DTE or string `"Expired"`** — rejected; `null` is the clean answer for "no active option"; rendering concern stays in the frontend.
- **Client-side sort** — rejected; duplicates ordering logic and risks divergence from the server's intent.

## Consequences

- `GET /api/positions` (now the `positions:list` IPC handler) returns `dte: int | None` per row.
- The renderer's `PositionCard` renders DTE as `"42d"` or `"Expired"` based on whether `dte` is null.
- The list view trusts the server's sort order; tests assert "first card matches the nearest-expiration ticker" rather than re-sorting client-side.
- The same principle applies to other derived fields (premium-waterfall ordering, sharesHeld, etc.): pure transforms live in core engines and are returned by services.

## Sources

- [extract: us-2](../../.extracts/us-2.md) — ADRs "DTE computation location (server-side)", "DTE for closed/expired positions returns null", "Sort order (DTE ascending, nulls last)"
- [feature: us-2-position-list](../../features/us-2-position-list.md)
<!-- /generated -->
