# Research: Extract Shared Sheet Primitives

## Portal Rendering Strategy

- **Decision:** Keep `createPortal(…, document.body)` inside each sheet component, not inside the shared primitive. The `SheetPortal` primitive renders the overlay/scrim/panel structure but the `createPortal` call stays in the sheet wrapper.
- **Rationale:** Some sheets may eventually need different portal targets, and keeping the portal call at the sheet level keeps the primitives pure layout components testable without portal mocking.
- **Alternatives considered:** Moving `createPortal` into `SheetPortal` — rejected because it couples the primitive to DOM API and complicates unit tests (every test would need `document.body` setup).

## Component API Style

- **Decision:** Use children-based composition (not render props or config objects). Each primitive (`SheetOverlay`, `SheetPanel`, `SheetHeader`, `SheetBody`, `SheetFooter`, `SheetCloseButton`) is a standalone component composed via JSX nesting.
- **Rationale:** Matches the existing codebase pattern (e.g., `SectionCard`, `StatGrid`, `PageLayout`). Maximizes flexibility — sheets with success states can swap `SheetHeader` props without changing the primitive.
- **Alternatives considered:** Single `<Sheet>` component with slot props — rejected as too rigid for the variety of sheet layouts (form vs. success state).

## Width Variation Handling

- **Decision:** `SheetPanel` accepts an optional `width` prop defaulting to `400`. Only `RollCspSheet` passes `420`.
- **Rationale:** Only one sheet uses a non-standard width. A prop is simpler than a variant system.
- **Alternatives considered:** Named size variants (`"default" | "wide"`) — over-engineering for a single exception.

## Header Variation Handling

- **Decision:** `SheetHeader` accepts optional `borderBottomColor` and `eyebrowColor` props for success-state tinting. The existing `OpenCcSheetHeader` will be replaced by `SheetHeader`.
- **Rationale:** Success states tint the header border green/gold. A color prop handles this without variant enums.
- **Alternatives considered:** Separate `SheetSuccessHeader` — rejected because the structure is identical, only colors differ.

## SIDEBAR_WIDTH Consolidation

- **Decision:** Export `SIDEBAR_WIDTH` from the new `Sheet.tsx` module. Remove the 7 local definitions.
- **Rationale:** Single source of truth. Already used identically across all sheets.
- **Alternatives considered:** Moving to `lib/tokens.ts` — acceptable but `Sheet.tsx` is the only consumer, so co-location is cleaner.

## Test Strategy

- **Decision:** Write unit tests for each primitive in `Sheet.test.tsx`. Existing sheet component tests remain unchanged — they test business behavior, not layout. Run all existing tests after each migration to catch regressions.
- **Rationale:** The refactor is pure structural — no behavior change. Existing tests are the regression safety net. New tests verify the primitives render correctly.
- **Alternatives considered:** Snapshot tests — rejected per project convention (no snapshot tests in codebase).
