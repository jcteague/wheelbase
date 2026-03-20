# MDX Gotchas for Mockup Files

MDX is parsed as a mix of Markdown and JSX. The parser switches between modes depending on context. Violating these rules causes `Unexpected end of file` or `unexpected token` parse errors.

---

## Rule 1: `//` Comments Between Exports Are Parsed as Markdown

**Problem:** Any `//` line comment that appears *outside* a function body or expression block is parsed as **Markdown text**, not JavaScript. If that comment contains JSX-like syntax (`<Badge>`, `<Input>`, etc.), MDX will attempt to parse the angle brackets as JSX tags and fail.

**Broken (comment between exports, contains `<Badge>`):**
```mdx
export const FOO = 1

// Matches: Badge.tsx
// Real usage: <Badge color="green">Label</Badge>   ← MDX tries to parse <Badge> as JSX!

export function Bar() { ... }
```

**Fixed option A — move comments inside the function:**
```mdx
export function MockBadge({ children, color }) {
  // Matches: Badge.tsx — <Badge color="green">Label</Badge>
  const fg = color ?? 'var(--wb-gold, #e6a817)'
  return ( ... )
}
```

**Fixed option B — use an MDX `{/* */}` comment at the top of an expression block:**
```mdx
{/*
  Matches: Badge.tsx
  Real usage: <Badge color="green">Label</Badge>
*/}

export function MockBadge({ children, color }) { ... }
```

**Fixed option C — avoid JSX-like syntax in free-standing comments entirely:**
```mdx
// Matches: Badge.tsx — color prop accepts any CSS color string

export function MockBadge({ children, color }) { ... }
```

---

## Rule 2: All `import` Statements Must Come First

All `import` statements must appear **before any markdown text or export statements**. Placing an import after markdown prose will cause a parse error.

**Broken:**
```mdx
# My Mockup

import { useState } from 'react'   ← error: import after markdown
```

**Fixed:**
```mdx
import { useState } from 'react'

# My Mockup
```

---

## Rule 3: `export` Statements Must Not Be Interrupted by Markdown

An `export` block that spans multiple lines must be a single, uninterrupted JS expression. Do not insert blank lines inside an object or array literal that would cause MDX to exit JS mode.

**Broken:**
```mdx
export const DATA = [
  { id: 1 },

  { id: 2 },   ← blank line causes MDX to exit the export block
]
```

**Fixed:**
```mdx
export const DATA = [
  { id: 1 },
  { id: 2 },
]
```

---

## Rule 4: Curly Brace Expressions Must Be Closed on the Same Nesting Level

MDX counts `{` and `}` carefully. If a JSX expression like `style={{ ... }}` is not closed before the file ends (or before the parser context changes), you get `Unexpected end of file in expression, expected a corresponding closing brace for {`.

Check: every `style={{` must have `}}`, every `{condition && (` must have `)}`.

---

## Rule 5: JSX Must Use `className`, Not `class`

MDX renders JSX, not HTML. Use `className` for CSS classes and `htmlFor` for label targets.

**Broken:** `<div class="container">`
**Fixed:** `<div className="container">`

---

## Rule 6: Self-Closing Tags Required for Void Elements

In JSX, void elements must be self-closed: `<br />`, `<hr />`, `<img />`. An unclosed `<br>` will cause a parse error.

---

## Summary: Safe Comment Patterns

| Location | Safe syntax |
|---|---|
| Inside a function body | `// any comment — including <JSX> syntax` |
| Between exports at file root | `// comment with NO angle brackets` |
| Between exports at file root | `{/* MDX block comment — JSX-safe */}` |
| Inline in JSX | `{/* inline JSX comment */}` |
