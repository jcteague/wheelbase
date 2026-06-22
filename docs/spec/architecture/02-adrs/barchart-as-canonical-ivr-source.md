# ADR: Barchart is the canonical IVR source

<!-- generated:from us-44 -->

## Decision

The persisted IVR collector is built directly on `fetchIVR` from `src/main/integrations/barchart-ivr-scraper.ts`, and persisted rows store `source = 'barchart'`.

## Why

The codebase already ships a typed Barchart scraper with an `IVRResult` union and `IVRDataSchema` whose source literal is `'barchart'`. Reusing that module keeps the collector thin and lets US-44 inherit the same parse/error taxonomy as US-43 instead of inventing a second IVR abstraction.

Persisting the vendor tag exactly as `'barchart'` also makes downstream reads explicit about provenance while keeping the schema simple.

## Alternatives considered

- **Introduce a generic multi-vendor IVR provider layer first** — rejected because the story only requires one source and no second IVR vendor exists in the app today.
- **Persist vendor-neutral rows with no source tag** — rejected because source provenance is cheap to store and useful for later debugging or data migrations.

## Source

- `plans/us-44/research.md`
- `src/main/integrations/barchart-ivr-scraper.ts`
- Feature page: `../../features/us-44-ivr-snapshot-store-and-scheduler.md`
<!-- /generated -->
