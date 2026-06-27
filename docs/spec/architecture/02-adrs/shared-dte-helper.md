# ADR: DTE calculation extracted into a shared pure helper

<!-- generated:from us-50 -->

## Decision

The `computeDte` logic is extracted from `src/main/services/list-positions.ts` into a pure helper `computeDte(expiration: string | null, now?: Date): number | null` in a new `src/main/core/dte.ts`, implemented with `date-fns` (`differenceInCalendarDays`) on an explicit calendar-day basis. Both `list-positions.ts` and the alert engine's input builder consume it; the private copy in `list-positions.ts` is deleted.

## Why

US-52 requires "the same DTE calculation already established in market-data surfaces so queue messaging and dashboard badges stay consistent." Centralizing removes the duplication and aligns with the project date-handling standard (use `date-fns`, avoid `timestamp.slice(0,10)` / ad-hoc string splitting). The alert engine must stay DB-free, so it cannot import the unexported helper that previously lived inside the `list-positions.ts` service.

## Alternatives considered

- **Import the private `computeDte` from `list-positions.ts`** — rejected; it is unexported and lives in a service file, so the pure engine cannot import it without pulling in DB code.

## Source

- `plans/us-50/research.md`
- Feature page: `../../features/us-50-alert-engine.md`
<!-- /generated -->
