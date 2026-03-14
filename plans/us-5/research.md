# Research: US-5 — Record CSP Expiring Worthless

## Lifecycle Validation Pattern

- **Decision:** Add `expireCsp(input)` to `src/main/core/lifecycle.ts` following the `closeCsp` function pattern — takes `currentPhase`, `expirationDate`, and `referenceDate`; validates phase is `CSP_OPEN` and `referenceDate >= expirationDate`
- **Rationale:** All lifecycle validation lives in pure core engines. The existing `closeCsp` validates phase and dates in the same file; `expireCsp` follows the same signature style.
- **Alternatives considered:** Inline validation inside the service layer — rejected because it violates the core/service separation enforced by architecture rules.

## Cost Basis Calculation

- **Decision:** Add `calculateCspExpiration(openPremiumPerContract, contracts)` to `src/main/core/costbasis.ts`. Returns `finalPnl = openPremiumPerContract × contracts × 100` and `pnlPercentage = "100.0000"`.
- **Rationale:** An expiration worthless returns 100% of collected premium. The calculation is simpler than `calculateCspClose` (no close price). Follows Decimal.js ROUND_HALF_UP pattern already established.
- **Alternatives considered:** Reusing `calculateCspClose` with closePrice = 0 — rejected because 0 is a special case that would distort pnlPercentage math.

## LegAction for Expiration

- **Decision:** Add `'EXPIRE'` to the `LegAction` enum in `src/main/core/types.ts`. The expire leg gets `action: 'EXPIRE'`, `leg_role: 'EXPIRE'`.
- **Rationale:** An expiration is neither a buy nor a sell. The story specifies `action: "expire"`. No DB constraint enforces the action values, and the renderer maps LegAction to display strings.
- **Alternatives considered:** Using `'SELL'` to represent the original sell side completing — rejected as semantically incorrect and confusing in leg history.

## IPC Handler Pattern

- **Decision:** New channel `positions:expire-csp` following the `positions:close-csp` pattern exactly — parse payload with Zod, call service, return `{ ok, ...result }`.
- **Rationale:** Every mutation IPC channel follows this pattern. No new patterns needed.
- **Alternatives considered:** N/A — established pattern.

## Preload Binding

- **Decision:** Add `expirePosition: (payload: unknown) => ipcRenderer.invoke('positions:expire-csp', payload)` to the preload `api` object.
- **Rationale:** Every IPC channel needs a corresponding preload binding. This follows the `closePosition` binding exactly.

## Right-Side Sheet UI Pattern

- **Decision:** Use the shadcn/ui `Sheet` component (`src/renderer/src/components/ui/sheet.tsx`) with `<SheetContent side="right">`. A `components.json` was created at the project root pointing to `src/renderer/src/` via the `@/` alias (confirmed via `tsconfig.web.json` paths). The Sheet is added via `pnpm dlx shadcn@latest add sheet --yes` — dry-run verified it writes exactly one file (`sheet.tsx`) and installs `@radix-ui/react-dialog`; it does not touch `index.css` or any existing files. The `ExpirationSheet` component wraps the shadcn Sheet primitives and manages two internal states: `'confirmation'` and `'success'`.
- **Rationale:** The existing UI components (`popover.tsx`, `calendar.tsx`) all use Radix UI primitives with `cn()`/Tailwind styling — the Sheet component follows the same pattern. shadcn's Sheet already provides the scrim overlay (`Dialog.Overlay`), slide-in animation via `tailwindcss-animate` (already installed), keyboard dismissal (Escape), and focus management. This eliminates all the custom CSS the mockup requires for the overlay/scrim.
- **Alternatives considered:** Custom `position: fixed` div — rejected now that the existing shadcn component pattern is confirmed; reinventing what Radix Dialog provides is unnecessary work. Using `npx shadcn@latest add sheet` CLI — rejected because there is no `components.json` to configure the CLI target paths; manual creation is the established pattern in this project.

## "Open New Wheel" Shortcut Navigation

- **Decision:** The shortcut button calls `navigate('/new?ticker=AAPL')` via wouter's `useLocation`. `NewWheelPage` reads the ticker from `useSearch()` (wouter) and passes it as `defaultTicker` prop to `NewWheelForm`. `NewWheelForm` uses `defaultValues` in `useForm` to pre-populate the ticker field.
- **Rationale:** Wouter's `useSearch` hook returns the query string for the current hash route. Using query params is idiomatic for pre-filling forms from navigation. No new state management library needed.
- **Alternatives considered:** Storing pre-fill state in a global Zustand store — rejected as over-engineered for a single ticker string. Context API — similar over-engineering.

## Positions List: Active/Closed Grouping

- **Decision:** Update `PositionsListPage` and `PositionCard` to separate positions into "Active" and "Closed" groups. Closed positions show at 0.55 opacity, "Final P&L" label in green. WHEEL_COMPLETE badge uses green color.
- **Rationale:** Screen 5 of the mockup shows this grouping. The acceptance criterion says "the AAPL position shows the WHEEL_COMPLETE phase badge". The existing PositionsListPage shows all positions in a flat list — adding closed grouping is required for correct post-expiration UX.
- **Alternatives considered:** Separate route for closed positions — rejected as over-engineering for Phase 1 scope.
