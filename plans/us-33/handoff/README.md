# Position Cockpit · component handoff

Extracted from Layout B of `Position Detail Redesign.html`. These files are written against your existing codebase conventions (`var(--wb-*)` CSS tokens, `MONO`/`SANS` from `lib/tokens.ts`, `SectionCard`, `StatGrid`, `Caption`, `fmtMoney` / `computeDte` from `lib/format.ts`, `PHASE_COLOR` / `PHASE_LABEL` from `lib/phase.ts`).

## Drop-in paths

Copy each file under `handoff/` into the same relative path inside your repo:

```
src/
├── lib/
│   └── verdict.ts                         ← pure logic, fully unit-testable
└── components/
    └── position-cockpit/
        ├── PositionCockpit.tsx            ← top-level — replaces PositionDetailContent body
        ├── VerdictBlock.tsx
        ├── RiskSnapshot.tsx
        ├── DeltaGauge.tsx
        ├── DistanceThermo.tsx
        ├── ContextStrip.tsx
        ├── PnlBar.tsx
        └── CollapsedDrawer.tsx
```

## Wiring

In `pages/PositionDetailPage.tsx`, replace:

```tsx
<PositionDetailContent detail={data} overlayOpen={overlayOpen} snapshot={activeSnapshot} />
```

with:

```tsx
<main
  data-testid="position-detail"
  className="flex-1 overflow-y-auto flex flex-col gap-4 p-6"
  style={overlayOpen ? DETAIL_OVERLAY_STYLE : undefined}
>
  <PositionCockpit detail={data} snapshot={activeSnapshot} />
  {/* keep existing CloseCspForm / RollCcSheet trigger / notes / closed banner below */}
</main>
```

## Assumptions to verify in your repo

The mockup's data shapes don't 1:1 match every field in your real types. Confirm:

| What I assumed                                         | Where to check                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `snapshot.greeks.{delta,theta,gamma,vega}` are strings | `OptionSnapshot` type — adjust `parseFloat()` calls in `PositionCockpit.tsx` if they're already numbers |
| `snapshot.underlyingPrice` is a string field           | If it's on a different field, fix the one line in `PositionCockpit.tsx`                                 |
| `snapshot.impliedVolatility` exists at top level       | Used for `greeks.iv`                                                                                    |
| `PHASE_LABEL.CSP_OPEN === 'Sell Put'`                  | I render whatever you give me; mockup used 'SELL PUT' uppercase                                         |

If anything mismatches, the only file you'll need to edit is `PositionCockpit.tsx` — the rest are pure-presentational and depend only on the `CockpitInput` shape in `lib/verdict.ts`.

## Tests worth writing

- `verdict.spec.ts` — one case per branch of `computeVerdict` (target-hit, csp-safe, approaching, itm-urgent, cc-moderate, holding-shares).
- `RiskSnapshot.spec.tsx` — assert the gauge label adds `· TIGHT` when `dte <= 7`.
- `ContextStrip.spec.tsx` — assert gamma cell goes amber when `dte <= 7 && |gamma| >= 0.04`.

## What's missing vs. the mockup

- **Stale-snapshot dimming** (AC-9 in the plan) — not implemented; needs you to decide the staleness threshold.
- **Tooltips** for "why this verdict" — left as `open question 1` in the plan.

## Tokens used

If any of these aren't defined in your `:root`, add them — the components reference them directly:

```css
--wb-bg-base, --wb-bg-surface
--wb-border, --wb-text-primary, --wb-text-secondary, --wb-text-muted
--wb-green, --wb-gold, --wb-red, --wb-sky
```

(`color-mix(in srgb, ...)` is used for transparency — Chromium 111+, Safari 16.2+. Fine for Electron.)
