# Quickstart: US-117

No migration, no seed data, no new dependency. This is a type-and-display fix — the only
setup that matters is the `better-sqlite3` ABI dance between the two test commands.

---

## 1. Unit + integration tests

```bash
pnpm rebuild:node          # only needed if the last thing you ran was pnpm test:e2e
pnpm test
```

Narrow to this story while iterating:

```bash
pnpm test src/main/integrations/alpaca-market-data-mappers.test.ts
pnpm test src/main/integrations/alpaca-market-data.test.ts
pnpm test src/renderer/src/lib/format.test.ts
pnpm test src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx
pnpm test src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx
```

`pnpm rebuild:node` is **manual**. pnpm 10 skips `pretest`, so nothing rebuilds for you; the
symptom of the wrong ABI is `NODE_MODULE_VERSION <n> … requires <m>` out of Vitest.

If `src/main/ipc/*.test.ts` times out at 5000 ms on its first case, that is the known flake
under CPU load — usually a stray Electron from another worktree's e2e run. Rerun that file in
isolation before investigating.

## 2. Type check

The whole point of this story is that `typecheck` currently passes over a lie. It must still
pass after `greeks.iv` is deleted from all three type declarations — and this is the gate
that proves nothing else was reading it.

```bash
pnpm typecheck
```

Expect it to **fail loudly** partway through implementation and name every fixture that still
spells `iv:` inside a `greeks` object. Those failures are the work list, not a problem:

- `src/renderer/src/components/position-cockpit/ContextStrip.spec.tsx:22`
- `src/renderer/src/components/position-cockpit/RiskSnapshot.spec.tsx:20`
- `src/renderer/src/components/position-cockpit/VerdictBlock.spec.tsx:27`
- `src/renderer/src/components/position-cockpit/PositionCockpit.spec.tsx:74`
- `src/renderer/src/components/PositionCard.test.tsx:53`
- `src/renderer/src/hooks/usePromotedQuote.test.ts:55`
- `src/renderer/src/hooks/useOptionSnapshots.test.ts:41`
- `src/renderer/src/lib/verdict.spec.ts` — several inline `CockpitInput` literals

Making `CockpitInput.impliedVolatility` required-and-nullable will add a second round of
errors at every inline `CockpitInput` literal. That is the compiler doing the job the
original bug escaped.

## 3. E2e

```bash
pnpm rebuild:electron      # required after any pnpm test run
pnpm test:e2e
```

Narrow to the cockpit:

```bash
pnpm test:e2e e2e/position-cockpit.spec.ts
```

If e2e reports `Electron failed to install correctly`, its postinstall was skipped:

```bash
node node_modules/electron/install.js && pnpm rebuild:electron
```

A hang on `waiting for event 'window'` means the Node ABI is loaded — run
`pnpm rebuild:electron`.

### Seeding snapshots in e2e

`FakeMarketDataProvider.getOptionSnapshot` reads the `WHEELBASE_MOCK_OPTION_SNAPSHOTS` env
var, a JSON map keyed by OCC symbol (`src/main/integrations/fake-market-data.ts:89`), passed
through `launchWithMocks(dbPath, { optionSnapshots })` at
`e2e/position-cockpit.spec.ts:121`. The fixtures are plain `OptionSnapshot` objects, so this
story's shapes seed directly:

```ts
// IV present, Greeks present
{ [OCC_30D]: { ...SNAP_HOLD, impliedVolatility: '0.2840' } }

// IV absent — expect '—', never 'NaN%'
{ [OCC_30D]: { ...SNAP_HOLD, impliedVolatility: undefined } }

// IV malformed — expect '—', never 'NaN%'
{ [OCC_30D]: { ...SNAP_HOLD, impliedVolatility: 'NaN' } }

// one bad Greek — all-or-nothing, so the strip does not render at all
{ [OCC_30D]: { ...SNAP_HOLD, greeks: { ...SNAP_HOLD.greeks, vega: 'NaN' } } }

// no snapshot at all — omit the key, or pass {}
{}
```

Note the existing `SNAP_HOLD` fixture at `e2e/position-cockpit.spec.ts:57` still spells
`greeks: { …, iv: '0.25' }`. That key must move out to a sibling `impliedVolatility` or the
IV assertions will read a dash.

## 4. Passing criteria

- `pnpm test` — all green, including the rewritten `ContextStrip.spec.tsx` NaN case
- `pnpm lint` — clean
- `pnpm typecheck` — clean, with `greeks.iv` gone from `src/preload/index.d.ts`,
  `src/renderer/src/api/market-data.ts` and `src/renderer/src/lib/verdict.ts`
- `pnpm format`
- `pnpm test:e2e e2e/position-cockpit.spec.ts` — all green, including
  `US-34 AC: Greeks unavailable — ContextStrip absent` at `:592` and the HOLDING_SHARES case
  at `:612`, both of which must pass **untouched**: they are the guard that this fix did not
  change the strip's gating
- Manual smoke: `grep -rn "greeks.iv\|greeks\.iv" src/` returns nothing
