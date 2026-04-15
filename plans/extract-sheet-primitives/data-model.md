# Data Model: Sheet Primitives

No new data model, IPC surface, or DB schema. This is a pure renderer-layer refactor.

## Component Primitives

### SheetOverlay

Renders the fixed-position overlay container with scrim backdrop.

| Prop       | Type              | Default  | Description                  |
| ---------- | ----------------- | -------- | ---------------------------- |
| `children` | `React.ReactNode` | required | Panel content                |
| `onClose`  | `() => void`      | required | Called when scrim is clicked |

Renders:

```
<div style="position:fixed; inset:0; left:SIDEBAR_WIDTH; z-index:50">
  <div style="position:absolute; inset:0" onClick={onClose} />  <!-- scrim -->
  {children}
</div>
```

### SheetPanel

Right-anchored panel container.

| Prop       | Type              | Default  | Description            |
| ---------- | ----------------- | -------- | ---------------------- |
| `children` | `React.ReactNode` | required | Header + body + footer |
| `width`    | `number`          | `400`    | Panel width in px      |

Renders:

```
<div style="position:absolute; top:0; right:0; bottom:0; width:{width}; background:var(--wb-bg-surface); border-left:1px solid var(--wb-border); display:flex; flex-direction:column; font-family:MONO; color:var(--wb-text-primary); box-shadow:-12px 0 48px rgba(0,0,0,0.5)">
  {children}
</div>
```

### SheetHeader

Header bar with eyebrow, title, optional subtitle, and close button.

| Prop                | Type         | Default                  | Description                 |
| ------------------- | ------------ | ------------------------ | --------------------------- |
| `eyebrow`           | `string`     | required                 | Uppercase label above title |
| `title`             | `string`     | required                 | Main heading                |
| `subtitle`          | `string`     | optional                 | Secondary line below title  |
| `onClose`           | `() => void` | required                 | Close button handler        |
| `eyebrowColor`      | `string`     | `'var(--wb-text-muted)'` | Eyebrow text color          |
| `borderBottomColor` | `string`     | `'var(--wb-border)'`     | Bottom border color         |

### SheetBody

Scrollable content area.

| Prop       | Type              | Default  | Description              |
| ---------- | ----------------- | -------- | ------------------------ |
| `children` | `React.ReactNode` | required | Form fields, cards, etc. |

Renders:

```
<div style="padding:20px 24px; overflow-y:auto; display:flex; flex-direction:column; gap:16; flex:1">
  {children}
</div>
```

### SheetFooter

Sticky bottom bar for action buttons.

| Prop       | Type              | Default  | Description |
| ---------- | ----------------- | -------- | ----------- |
| `children` | `React.ReactNode` | required | Buttons     |

Renders:

```
<div style="padding:16px 24px; border-top:1px solid var(--wb-border); display:flex; gap:10; flex-shrink:0">
  {children}
</div>
```

### SheetCloseButton

Standalone close button (× character). Used inside `SheetHeader` and independently in success states.

| Prop      | Type         | Default  | Description   |
| --------- | ------------ | -------- | ------------- |
| `onClick` | `() => void` | required | Close handler |

Renders:

```
<button type="button" aria-label="Close sheet" style="width:28; height:28; border-radius:6; border:1px solid var(--wb-border); background:var(--wb-bg-elevated); color:var(--wb-text-muted); cursor:pointer">×</button>
```

## Shared Constants

| Constant        | Value | Current location      | New location           |
| --------------- | ----- | --------------------- | ---------------------- |
| `SIDEBAR_WIDTH` | `200` | 7 sheet files (local) | `Sheet.tsx` (exported) |
