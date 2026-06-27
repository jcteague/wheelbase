---
page: docs/spec/architecture/02-adrs/barchart-as-canonical-ivr-source.md
audited_at: 2026-06-27
findings: 0
---

# Audit: barchart-as-canonical-ivr-source.md

## Verified (6)

- ✓ `src/main/integrations/barchart-ivr-scraper.ts` exists.
- ✓ `fetchIVR` is exported: `src/main/integrations/barchart-ivr-scraper.ts:356`.
- ✓ The IVR collector imports `fetchIVR` from that module: `src/main/services/ivr-collector.ts:5`.
- ✓ `IVRResult` union exists: `src/main/integrations/barchart-ivr-scraper.ts:78`.
- ✓ `IVRDataSchema` with `source: z.literal('barchart')`: `src/main/integrations/barchart-ivr-scraper.ts:22,28`.
- ✓ Persisted rows store the source from the result (`result.data.source`), which is `'barchart'`: `src/main/services/ivr-collector.ts:81,93` (`INSERT INTO ivr_snapshot (... source)`); the literal `'barchart'` is produced at scraper line 330.

## Drift (0)

None.

## Unverifiable (0)

None of substance — the "inherit the same parse/error taxonomy as US-43" reasoning is narrative but the reuse claim itself is verified by the import.

## Missing files (0)

- ✓ Feature page `../../features/us-44-ivr-snapshot-store-and-scheduler.md` exists.
