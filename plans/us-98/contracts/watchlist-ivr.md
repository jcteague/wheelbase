# Contract: US-96 watchlist IVR integration

US-96 is not implemented in this checkout. This contract specifies the required extension, not an existing channel. Reconcile names against merged US-96 before /plan-tasks; reuse its snapshot IPC and do not add a competing endpoint.

## Required shape and behavior

The watchlist snapshot's IVR field becomes the same assessed reading/null as screener-results.md. Compute it using getAssessedIvrByUnderlying and the shared earnings read, at the same request clock used by Signal.

The pure US-96 deriveSignal consumes assessed IVR:

| IV gate input                     | Gate verdict                  |
| --------------------------------- | ----------------------------- |
| no IV condition                   | no IV gate                    |
| usable reading at/above threshold | met                           |
| usable below threshold            | unmet, IV low                 |
| stale                             | unknown, IV too old to judge  |
| predates_earnings                 | unknown, IV predates earnings |
| missing/expired/unassessable      | unknown, IV unavailable       |

Any required unknown gate prevents Entry ready. Preserve US-96's other gate precedence; if price is primary, show the unknown IV reason as secondary. Render through the shared IvrCell. Preserve the existing response envelope, payload Zod schema, and read-only nature of the snapshot endpoint.

## Tests and isolation

Use identical IVR/earnings/now fixtures to compare watchlist and screener assessment. A ticker's earnings-store failure affects its earnings knowledge only; its time age and other rows remain available. No IVR collector or chain read is introduced by this extension. Readings may be re-evaluated at US-96's existing refresh boundary.

Proposed integration locations, pending US-96: services/watchlist-snapshot.ts and core/watchlist-signal.ts (deriveSignal). These are extension targets after the prerequisite, not instructions to recreate all US-96 behavior.
