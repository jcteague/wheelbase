# Token Catalog: wb-\* → Tailwind Utility Mapping

All entries go into the `@theme inline` block in `src/renderer/src/index.css`.

## Color Tokens

| CSS Variable          | @theme entry                                          | Example utilities generated                       |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| `--wb-bg-base`        | `--color-wb-bg-base: var(--wb-bg-base)`               | `bg-wb-bg-base`                                   |
| `--wb-bg-surface`     | `--color-wb-bg-surface: var(--wb-bg-surface)`         | `bg-wb-bg-surface`                                |
| `--wb-bg-elevated`    | `--color-wb-bg-elevated: var(--wb-bg-elevated)`       | `bg-wb-bg-elevated`                               |
| `--wb-bg-hover`       | `--color-wb-bg-hover: var(--wb-bg-hover)`             | `bg-wb-bg-hover`                                  |
| `--wb-border`         | `--color-wb-border: var(--wb-border)`                 | `border-wb-border`, `bg-wb-border`                |
| `--wb-border-subtle`  | `--color-wb-border-subtle: var(--wb-border-subtle)`   | `border-wb-border-subtle`                         |
| `--wb-text-primary`   | `--color-wb-text-primary: var(--wb-text-primary)`     | `text-wb-text-primary`                            |
| `--wb-text-secondary` | `--color-wb-text-secondary: var(--wb-text-secondary)` | `text-wb-text-secondary`                          |
| `--wb-text-muted`     | `--color-wb-text-muted: var(--wb-text-muted)`         | `text-wb-text-muted`                              |
| `--wb-gold`           | `--color-wb-gold: var(--wb-gold)`                     | `bg-wb-gold`, `text-wb-gold`, `border-wb-gold`    |
| `--wb-gold-dim`       | `--color-wb-gold-dim: var(--wb-gold-dim)`             | `bg-wb-gold-dim`                                  |
| `--wb-gold-border`    | `--color-wb-gold-border: var(--wb-gold-border)`       | `border-wb-gold-border`                           |
| `--wb-gold-subtle`    | `--color-wb-gold-subtle: var(--wb-gold-subtle)`       | `bg-wb-gold-subtle`                               |
| `--wb-green`          | `--color-wb-green: var(--wb-green)`                   | `bg-wb-green`, `text-wb-green`, `border-wb-green` |
| `--wb-green-dim`      | `--color-wb-green-dim:  var(--wb-green-dim)`          | `bg-wb-green-dim`                                 |
| `--wb-green-border`   | `--color-wb-green-border: var(--wb-green-border)`     | `border-wb-green-border`                          |
| `--wb-green-subtle`   | `--color-wb-green-subtle: var(--wb-green-subtle)`     | `bg-wb-green-subtle`                              |
| `--wb-red`            | `--color-wb-red: var(--wb-red)`                       | `text-wb-red`, `bg-wb-red`                        |
| `--wb-red-dim`        | `--color-wb-red-dim: var(--wb-red-dim)`               | `bg-wb-red-dim`                                   |
| `--wb-blue`           | `--color-wb-blue: var(--wb-blue)`                     | `text-wb-blue`                                    |
| `--wb-blue-dim`       | `--color-wb-blue-dim: var(--wb-blue-dim)`             | `bg-wb-blue-dim`                                  |
| `--wb-teal`           | `--color-wb-teal: var(--wb-teal)`                     | `text-wb-teal`, `bg-wb-teal`                      |
| `--wb-teal-dim`       | `--color-wb-teal-dim: var(--wb-teal-dim)`             | `bg-wb-teal-dim`                                  |
| `--wb-teal-bright`    | `--color-wb-teal-bright: var(--wb-teal-bright)`       | `bg-wb-teal-bright`                               |
| `--wb-violet`         | `--color-wb-violet: var(--wb-violet)`                 | `text-wb-violet`                                  |
| `--wb-violet-dim`     | `--color-wb-violet-dim: var(--wb-violet-dim)`         | `bg-wb-violet-dim`                                |
| `--wb-sky`            | `--color-wb-sky: var(--wb-sky)`                       | `text-wb-sky`                                     |

## Font Token

| Source                             | @theme entry                                                                              | Utility        |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | -------------- |
| `MONO` constant in `lib/tokens.ts` | `--font-wb-mono: ui-monospace, 'SF Mono', Menlo, 'Cascadia Code', 'Fira Code', monospace` | `font-wb-mono` |

## Shadow Token

| CSS Variable        | @theme entry                                      | Utility        |
| ------------------- | ------------------------------------------------- | -------------- |
| `--wb-shadow-sheet` | `--shadow-sheet: -12px 0 48px rgba(0, 0, 0, 0.5)` | `shadow-sheet` |

## Inline Style Conversion Reference

Common patterns that appear across many components, and their Tailwind equivalents after token integration:

| Inline style                                 | Tailwind class              |
| -------------------------------------------- | --------------------------- |
| `fontFamily: MONO`                           | `font-wb-mono`              |
| `background: 'var(--wb-bg-elevated)'`        | `bg-wb-bg-elevated`         |
| `background: 'var(--wb-bg-surface)'`         | `bg-wb-bg-surface`          |
| `borderRight: '1px solid var(--wb-border)'`  | `border-r border-wb-border` |
| `borderBottom: '1px solid var(--wb-border)'` | `border-b border-wb-border` |
| `borderTop: '1px solid var(--wb-border)'`    | `border-t border-wb-border` |
| `border: '1px solid var(--wb-border)'`       | `border border-wb-border`   |
| `color: 'var(--wb-text-primary)'`            | `text-wb-text-primary`      |
| `color: 'var(--wb-text-secondary)'`          | `text-wb-text-secondary`    |
| `color: 'var(--wb-text-muted)'`              | `text-wb-text-muted`        |
| `color: 'var(--wb-gold)'`                    | `text-wb-gold`              |
| `color: 'var(--wb-green)'`                   | `text-wb-green`             |
| `boxShadow: '-12px 0 48px rgba(0,0,0,0.5)'`  | `shadow-sheet`              |
| `borderRadius: 8`                            | `rounded-lg`                |
| `borderRadius: 6`                            | `rounded-md`                |
| `overflow: 'hidden'`                         | `overflow-hidden`           |
| `overflowY: 'auto'`                          | `overflow-y-auto`           |
| `display: 'flex'`                            | `flex`                      |
| `flexDirection: 'column'`                    | `flex-col`                  |
| `alignItems: 'center'`                       | `items-center`              |
| `justifyContent: 'space-between'`            | `justify-between`           |
| `flex: 1`                                    | `flex-1`                    |
| `flexShrink: 0`                              | `shrink-0`                  |

## Values That Must Remain Inline

These cannot be expressed as static Tailwind utilities because they are runtime-computed:

- `SheetPanel`: `style={{ width: '${width}px' }}` — `width` is a prop
- `SheetHeader`: `style={{ borderBottom: '1px solid ${borderBottomColor}' }}` — prop
- `SheetHeader` eyebrow span: `style={{ color: eyebrowColor }}` — prop
- Per-row background gradients where color is derived from data (e.g., P&L positive/negative)
- `style={{ left: SIDEBAR_WIDTH }}` in `SheetOverlay` — `SIDEBAR_WIDTH` is a constant (200); this _can_ become `left-[200px]` since it is static
