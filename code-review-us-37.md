# Code Review Summary — branch `us-3t` (US-37 Settings + Paper/Live Toggle)

> Prompt: *"This branch is complete and ready to be merged into main. Perform a thorough code review to look for any bugs, missing acceptance criteria, and verify development standards have been followed."*

## Verification results

- ✅ `pnpm typecheck` — passes
- ❌ `pnpm lint` — fails (2 errors in `e2e/settings-environment.spec.ts:76-77`)
- ✅ `pnpm test` — 1221/1221 pass

**Recommendation: do not merge as-is.** Three blockers around Massive credentials being silently descoped, faked Test-connection UX on saved credentials, and a broken lint check. Full findings below.

---

## Blockers (must fix before merge)

1. **Lint is broken** — `e2e/settings-environment.spec.ts:76-77` has `no-constant-binary-expression` errors (`` `${dbPath}-wal` `` && `fs.existsSync(...)`). The truthy template literal is dead code. Drop the redundant guard. CLAUDE.md post-change checklist requires `pnpm lint` to pass.

2. **"Test connection" button on saved Alpaca credentials is fake** — `SettingsPage.tsx:247-258`. When a card is in "configured" (non-editing) state, the button never calls IPC; it just sets `setMessage({ tone: 'success', text: ✓ Verified — Account ${accountNumberMasked ?? 'PA…ABC'} ... })`. The trader is shown success regardless of whether the stored credential still authenticates. Add a `settings:test-stored-connection` IPC that decrypts server-side and re-probes, or hide the button outside editing mode.

3. **Post-save UI displays placeholder strings as real account numbers** — `SettingsPage.tsx:132-140, 252`. Fallbacks `'PA…ABC'` and `'AL…ZYX'` are demo placeholders rendered as if they were real masked account IDs. After save, the message should come from the test-connection response, not stale prop + fallback.

4. **IPC handlers throw to the renderer** — `src/main/ipc/settings.ts:115-118` calls `TestConnectionPayloadSchema.parse(payload)` and `await testConnection(parsed)` outside `handleIpcCall`. `ZodError` and `trimRequired` throws escape to the renderer instead of returning `{ ok: false, errors: [...] }`. Same shape issue in `save-alpaca-credentials`. CLAUDE.md: "IPC handlers never throw to the renderer."

5. **IPC handler does business logic** — `src/main/ipc/settings.ts:34-94`. The save-alpaca handler orchestrates test → branch → save → read-before/after → refresh-broker. Per `feedback_ipc_pattern` memory, handlers must be thin (Zod + service call). Move test-then-save into a service method.

6. **Massive user credential flow is missing entirely** — `src/main/integrations/massive-credentials.ts` returns `process.env.MASSIVE_API_KEY ?? ''`. There is no `settings:save-massive-key` / `settings:remove-massive-key` IPC, no Zod schema, no renderer input, no Replace button, no Remove. The AC explicitly requires all of these. The SettingsPage prints "Massive is app-provided and not stored in settings" — a unilateral descope documented in `plans/us-37/refactor-phase-results.md` without an updated AC.

## Should fix

- **Zero logging** in `services/settings.ts`, `services/settings-connections.ts`, `ipc/settings.ts` (S1). CLAUDE.md "Logging Standards" — credential saved/removed/env switched are exactly the business events INFO is for. Existing service modules log; this one doesn't.
- **Banners hidden when no positions exist** — `PositionsListPage.tsx:214-239`. The Massive setup banner, "Connect Alpaca" banner, and auth-failure prompts all live inside `data && data.length > 0`. Fresh install sees nothing. Move out of the conditional.
- **EnvironmentBadge "NO BROKER" tooltip says "Click to set up"** but the badge is a `<span>` with no click handler — `EnvironmentBadge.tsx:25`, `App.tsx:67`. Either wire navigation or fix the copy.
- **LIVE radio still triggers the confirm dialog when LIVE credentials are missing** — `SettingsPage.tsx:417-436`. Mutation fails silently after confirm. Disable the radio when its credentials are missing.
- **Initial render flashes "NO BROKER"** before the settings query resolves (S5). AC says badge should read PAPER "immediately" on relaunch.
- `marketDataFactory.recreate()` **never wired for Massive key change** (S7) — asymmetric with broker factory.
- **Missing reverse environment-mismatch detection** when LIVE card receives paper (`PK*`) keys (S9).
- **Dead code:** `MarketDataFactoryConfig.loadSettingsStatus` field (S6), `last_verified_at` column never read (N3).

## Missing acceptance criteria

| Scenario | Status |
| --- | --- |
| Massive API key field, Save, Replace, Remove, masked-on-reload, trim-on-paste | Missing (B6) |
| Test connection on saved Alpaca credentials | Faked (B2) |
| Stale-price fallback after Massive removed | Missing (no remove flow) |
| Mid-session 401 degrades MarketDataStatusDot to grey | Missing — dot reads only static `massive: configured\|missing` |
| Empty-state banner on positions list with the AC copy | Missing/off-spec — text only on Settings page, and only when positions exist |
| Massive •••••••• mask on next page load + Replace flow | Missing |

## Nits

- `BrokerEnvironment` type declared in two modules (N6)
- `app_settings` table is a generic kv store for a single key (N2)
- Unreachable `vendor !== 'alpaca'` guard in `ipc/settings.ts:75-81` (N1)
- Pre-existing `boxShadow` inline style in `App.tsx:24-26` — not introduced here but adjacent (N5)

---

**Bottom line:** Alpaca paper/live toggle, encrypted save, confirm dialog, env persistence, and query-key scoping are solid and well-tested. The blockers are the silent Massive descope, the faked test-connection on saved credentials, and lint. Recommend: fix the lint error, get product sign-off on the Massive descope (or implement the user-credential flow), replace the fake stored-credential test-connection, and tighten the IPC contracts before merging.
