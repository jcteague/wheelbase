# ADR: Barchart is retired from code and schema, not just from the read path

<!-- generated:from us-121 -->

## Decision

- Delete `src/main/integrations/barchart-ivr-scraper.ts` and `src/main/integrations/fake-ivr.ts`
  (with their tests), the `_test:ivr-set-outcomes` / `_test:ivr-fetch-log` channels and their
  preload entries.
- Drop the `ivr_snapshot` table (and its index) at the end of migration 016.
- **Keep** the shared vocabulary: the `ivr-collect` job name, the `ivr:collect-now` channel, the
  `ivr:snapshot-updated` push, the `IvrOnDemand` port and the Settings "Refresh IVR now" action.

**Supersedes** [barchart-as-canonical-ivr-source](./barchart-as-canonical-ivr-source.md).

## Why

- Barchart put its site behind an AWS WAF challenge; the scraped IV rank died. The collector was the
  scraper's only caller, so once it stopped calling, the module was dead code this change created —
  which CLAUDE.md says to remove.
- The same argument covers the table. The story first said "keep the rows for provenance", but
  Barchart's rank is a different quantity from ours, so the rows can never be compared with the new
  series; they go stale past the ten-session boundary within two weeks; and a table nothing reads is
  spec drift with a test surface that exists only to prove it is ignored. Planning review
  (2026-09-20) chose to drop it, and the Linear scenario became "Barchart readings are removed on
  upgrade".
- The channel and job names are the shared vocabulary of six e2e specs, the scheduler registry test
  and the renderer; renaming them buys nothing.

## Alternatives considered

- **Keep the scraper as a fallback** — the story rules it out; the WAF challenge is the vendor
  asking for a human.
- **Keep `ivr_snapshot` for provenance** — the story's original wording, rejected above.
- **Rename `ivr:*` to `iv-history:*`** — churn without behaviour.

## Note

`cheerio` in `package.json` is not imported anywhere under `src/` — a pre-existing unused
dependency, noted by the plan and not removed.

## Source

- [extract: us-121](../../.extracts/us-121.md) — ADR "Barchart is retired from code and schema…"
- `migrations/016_create_iv30_history.sql`
- Feature page: [us-121](../../features/us-121-iv-rank-from-own-iv-history.md)
<!-- /generated -->
