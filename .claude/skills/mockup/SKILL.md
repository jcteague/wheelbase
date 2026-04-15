---
name: mockup
description: This skill should be used when the product-owner skill has just produced a user story, when the user asks to "create a mockup", "generate a mockup for this story", "mockup this feature", or "visualize this user story". Produces a self-contained MDX mockup file using project components first, shadcn/ui primitives second, delegating visual design to the frontend-design skill.
---

# Mockup — UI Visualization from User Stories

Generate a polished, self-contained MDX mockup from a user story. Delegate visual design to the `frontend-design` skill. Use the correct component resolution order for all UI elements.

## When to Run

Run immediately after `product-owner` produces a user story — no explicit user request needed. Also run when the user explicitly asks for a mockup of a feature or story.

## Output

A single `.mdx` file saved to `mockups/{story-slug}.mdx`.

The file contains:

- YAML frontmatter with story metadata
- Markdown sections for story context and acceptance criteria states
- Inline JSX component that renders the mockup with hardcoded mock data

The component must be self-contained — no IPC, no TanStack Query, no live data. All data is `const` mock values defined at the top of the JSX export.

## Step 1: Extract UI Requirements

Read the user story and identify:

1. **Screen / view** — what page or panel does this belong to?
2. **Data displayed** — what fields, values, statuses does the user see?
3. **User actions** — what can the user click, type, or submit?
4. **States** — map each `Then` clause in acceptance criteria to a visible UI state (success, error, empty, loading, edge case)
5. **Navigation** — does this screen link to or open other views?

If the story has no UI component (pure backend, migration, data model), skip the mockup and say so.

## Step 2: Discover Available Components

**Resolution order — always prefer earlier entries:**

1. **Project components** — `src/renderer/src/components/**/*.tsx`
2. **shadcn/ui primitives** — `src/renderer/src/components/ui/*.tsx`
3. **Raw HTML** — only when neither exists

### Scanning project components

Glob `src/renderer/src/components/**/*.tsx` and read relevant files to understand their props and purpose. Prefer project components that encode domain-specific abstractions (e.g. `<PositionCard>`, `<LegBadge>`, `<PhasePill>`).

### Common shadcn/ui fallbacks

| UI element        | shadcn/ui import                                                                       |
| ----------------- | -------------------------------------------------------------------------------------- |
| Form label        | `<Label>`                                                                              |
| Text input        | `<Input>`                                                                              |
| Button            | `<Button>`                                                                             |
| Select / dropdown | `<Select>`, `<SelectTrigger>`, `<SelectContent>`, `<SelectItem>`                       |
| Card container    | `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`                               |
| Data table        | `<Table>`, `<TableHeader>`, `<TableRow>`, `<TableHead>`, `<TableBody>`, `<TableCell>`  |
| Modal / dialog    | `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`                       |
| Tabs              | `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>`                               |
| Badge             | `<Badge>`                                                                              |
| Alert             | `<Alert>`, `<AlertDescription>`                                                        |
| Form wrapper      | `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormMessage>` |

Consult the `shadcn` skill for component-specific props and composition patterns when needed.

## Step 3: Invoke frontend-design

Pass to the `frontend-design` skill:

- Extracted UI requirements (screen, data, actions, states)
- The component inventory from Step 2
- **Constraint**: use the component inventory — no raw `<label>`, `<input>`, `<button>`, `<select>`, or `<table>` where a component exists
- **Wheelbase aesthetic context**: dense data display, financial precision, dark-only trading terminal, React 19 + shadcn/ui + Tailwind CSS v4

The `frontend-design` skill owns all visual design decisions. Let it make bold choices within the component constraint.

## Step 4: Write the MDX File

> **MDX parse rules — read `references/mdx-gotchas.md` before writing.** The most common failure:
> `//` comments that appear _between_ `export` blocks are parsed as Markdown, not JavaScript.
> If those comments contain JSX-like syntax (`<Badge>`, `<Input>`, etc.) MDX will throw a parse error.
> **Rule:** only put `//` comments _inside_ function bodies, or use `{/* */}` block comments at the file root.

Use this structure:

```mdx
---
title: '{US-N}: {Story Title}'
story: '{one-line story summary}'
states: ['{state1}', '{state2}']
---

# {US-N}: {Story Title}

_{story summary}_

## Acceptance Criteria States

- **{state1}**: {what the user sees}
- **{state2}**: {what the user sees}

---

export const MOCK_DATA = [ ... ]

export function Mockup() {
  const [state, setState] = useState('{state1}')

return (

<div>
{/* Dev state toggle — remove before using as spec */}
<div style={{ ... }}>
{['{state1}', '{state2}'].map(s => (
<button key={s} onClick={() => setState(s)}>{s}</button>
))}
</div>

      {state === '{state1}' && ( ... )}
      {state === '{state2}' && ( ... )}
    </div>

)
}

<Mockup />
```

Include a state toggle bar only when the story has multiple `Then` states — so all acceptance criteria states are reachable without code changes.

## Step 5: Save and Report

Write the file to `mockups/{story-slug}.mdx`.

Naming convention:

- `US-12: View open positions list` → `mockups/us-12-view-open-positions-list.mdx`
- `US-7: Enter a new CSP leg` → `mockups/us-7-enter-new-csp-leg.mdx`

Report back:

- File path written
- Acceptance criteria states shown in the toggle
- Project components reused (if any)
- Any shadcn/ui components that may need installing: `pnpm dlx shadcn@latest add {component}`

## Viewing Mockups

Run `pnpm mockups` from the project root to open the standalone Vite viewer at `localhost:5173`. The viewer auto-discovers all `.mdx` files in `mockups/` and lists them in the sidebar.

## Additional Resources

- **`references/mdx-gotchas.md`** — MDX parse rules and common failure patterns. Read this before writing any MDX file.

## Wheelbase Design Context

Pass this to `frontend-design`:

- **App type:** Single-user Electron desktop trading journal
- **Strategy:** Options wheel — CSP → assignment → covered calls
- **Key entities:** Wheel (position), Leg (option transaction), Roll, Cost Basis
- **UI density:** Traders read many numbers at a glance — compact, scannable layouts
- **Theme:** Dark-only; `--wb-gold` (#e6a817) as primary accent; `--wb-green`/`--wb-red` for P&L
- **Stack:** React 19, shadcn/ui, Tailwind CSS v4
