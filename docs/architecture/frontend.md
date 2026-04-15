# Frontend Architecture

React 19 SPA running in Electron's renderer process.

## Routing

- **Library:** wouter with hash-based routing (`useHashLocation`) — required for Electron `file://` URLs
- **Routes:**
  - `/` → `PositionsListPage` — table of all positions (active/closed groups)
  - `/new` → `NewWheelPage` — form to open a new wheel (accepts `?ticker=` query param)
  - `/positions/:id` → `PositionDetailPage` — full position detail with actions

## Layout

```
┌──────────┬──────────────────────────────────┐
│ Sidebar  │  PageHeader (sticky)             │
│ 200px    ├──────────────────────────────────┤
│ fixed    │  Page content (scrollable)       │
│          │                                  │
│ Links:   │                                  │
│ - Home   │                                  │
│ - New    │                                  │
└──────────┴──────────────────────────────────┘
```

Sidebar and layout shell are defined in `App.tsx`. Pages use `PageLayout` + `PageHeader` from `components/PageLayout.tsx`.

## Data fetching pattern

All server state managed via TanStack Query. One hook per operation:

| Hook                | Type     | Query key                   | API function              |
| ------------------- | -------- | --------------------------- | ------------------------- |
| `usePositions`      | query    | `['positions']`             | `listPositions()`         |
| `usePosition(id)`   | query    | `['positions', id]`         | `getPosition(id)`         |
| `useCreatePosition` | mutation | —                           | `createPosition(payload)` |
| `useClosePosition`  | mutation | invalidates `['positions']` | `closePosition(payload)`  |
| `useExpirePosition` | mutation | invalidates `['positions']` | `expirePosition(payload)` |

Hooks live in `src/renderer/src/hooks/`. Each is a thin wrapper — no business logic.

## Form pattern

Forms use React Hook Form + Zod resolver:

```
Schema (schemas/*.ts)     — Zod schema defines shape + validation
  → useForm({ resolver }) — React Hook Form with zodResolver
    → onSubmit             — calls mutation hook
      → onError            — maps API field errors to form fields
      → onSuccess          — navigate or show confirmation
```

Field error mapping: API adapter converts IPC camelCase field names to form snake_case field names via `IPC_TO_FORM_FIELD` lookup.

Schemas in `src/renderer/src/schemas/`:

- `common.ts` — shared validators: `tickerSchema`, `positiveMoneySchema`, `positiveIntegerSchema`, `isoDateSchema`
- `new-wheel.ts` — `newWheelSchema` for the new wheel form

## Component responsibilities

| Component                   | Role                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| Pages (`pages/`)            | Route-level containers. Fetch data via hooks, compose components.              |
| `PageLayout` / `PageHeader` | Shared layout shell — header + scrollable body.                                |
| `NewWheelForm`              | Form with validation, submission, error/success states.                        |
| `CloseCspForm`              | Inline form on detail page with live P&L preview.                              |
| `ExpirationSheet`           | Portal-based right-side panel (confirmation + success states).                 |
| `PositionRow`               | Single table row. Clickable, hover effect, phase badge.                        |
| `ui/*`                      | shadcn primitives (Button, Calendar, DatePicker, Form, Input, Label, Popover). |

## Design system

Tokens defined as CSS custom properties in `src/renderer/src/index.css` `:root` block:

| Token pattern      | Example                                | Usage              |
| ------------------ | -------------------------------------- | ------------------ |
| `--wb-bg-*`        | `--wb-bg-surface`, `--wb-bg-elevated`  | Background layers  |
| `--wb-text-*`      | `--wb-text-primary`, `--wb-text-muted` | Text hierarchy     |
| `--wb-border`      | `--wb-border`, `--wb-border-subtle`    | Borders            |
| `--wb-{color}`     | `--wb-gold`, `--wb-green`, `--wb-red`  | Semantic accents   |
| `--wb-{color}-dim` | `--wb-gold-dim`, `--wb-green-dim`      | Tinted backgrounds |

Phase colors mapped in `lib/phase.ts` (`PHASE_COLOR` record).

Font: monospace throughout (`ui-monospace, "SF Mono", Menlo, monospace`).

## Adding a new page

1. Create page component in `src/renderer/src/pages/`
2. Add route in `App.tsx` (`<Route path="/..." component={...} />`)
3. Add sidebar link in `App.tsx` `Sidebar` component (if navigable)
4. Use `PageLayout` + `PageHeader` for consistent layout
5. Fetch data via hooks from `src/renderer/src/hooks/`

## Adding a new form

1. Define Zod schema in `src/renderer/src/schemas/` (reuse `common.ts` validators)
2. Create component with `useForm({ resolver: zodResolver(schema), mode: 'onBlur' })`
3. Create mutation hook in `src/renderer/src/hooks/`
4. Map API errors to form fields in `onError` handler
5. Handle success state (navigate, show confirmation, invalidate queries)

## Known patterns and constraints

- **Portal sheets** use inline styles due to Tailwind v4 `@layer` scope issue (see `plans/fix-sheet-portal-styles/plan.md`)
- **PositionRow** uses inline styles for dynamic phase colors (hex + alpha suffixes can't be Tailwind classes)
- **No global state store** — all server state in TanStack Query, all UI state in component `useState`
- shadcn components available: Button, Calendar, DatePicker, Form, Input, Label, Popover
