# pretext-editor

High-performance Canvas-virtualized code editor for React, based on [pretext](https://chenglou.me/pretext). Renders only visible
lines via Canvas 2D, so it stays smooth even on very large files.

## How it works

| Layer | Technology |
|---|---|
| Text layout engine | [@chenglou/pretext](https://github.com/chenglou/pretext) Pure JavaScript/TypeScript library for multiline text measurement |
| Rendering | Canvas 2D API — only visible lines are drawn each frame |
| Syntax highlighting | [Shiki](https://shiki.style/) with JavaScript regex engine (no WASM) |
| Tokenization cache | Module-level `Map` — results cached across mounts, `useDeferredValue` keeps typing fast |
| Keyboard / IME input | Hidden `<textarea>` captures all keyboard events and IME composition |

## Installation

```bash
npm install pretext-editor
```

## Usage

```tsx
import { useRef, useState } from 'react'
import { PretextEditor } from 'pretext-editor'
import type { PretextEditorHandle } from 'pretext-editor'

export function Editor() {
  const [code, setCode] = useState('// hello world\n')
  const editorRef = useRef<PretextEditorHandle>(null)

  return (
    <div style={{ height: 600 }}>
      <PretextEditor
        ref={editorRef}
        value={code}
        onChange={setCode}
        language="typescript"
      />
    </div>
  )
}
```

The component fills its parent — give the parent an explicit height.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `value` | `string` | — | Document content (controlled) |
| `onChange` | `(value: string) => void` | — | Called on every edit |
| `language` | `string` | `undefined` | Shiki language id (`"typescript"`, `"go"`, `"python"` …). Omit to disable highlighting. |
| `fontSize` | `number` | `14` | Font size in px |
| `fontFamily` | `string` | `'Menlo, Monaco, "Courier New", monospace'` | CSS font-family string |
| `tabSize` | `number` | `4` | Visual width of `\t` in spaces. Raw `\t` is preserved in content. |
| `className` | `string` | — | Class on the scroll container |
| `style` | `CSSProperties` | — | Inline style on the scroll container |
| `ref` | `Ref<PretextEditorHandle>` | — | Imperative handle for scroll control |

## Imperative handle

`PretextEditor` forwards a ref exposing scroll control for host-level coordination
(e.g. syncing scroll position when switching between editor and preview modes):

```tsx
const editorRef = useRef<PretextEditorHandle>(null)

// Get the source line at the top of the viewport
const topLine = editorRef.current?.getTopLine()

// Scroll to a specific source line
editorRef.current?.scrollToLine(42)
```

| Method | Returns | Description |
|---|---|---|
| `getTopLine()` | `number` | Index of the source line currently at the top of the visible area |
| `scrollToLine(line)` | `void` | Scroll the viewport so `line` appears at the top |

## Supported languages

Any language bundled with Shiki is supported. Common ones:

`typescript` · `tsx` · `javascript` · `jsx` · `python` · `rust` · `go` ·
`c` · `cpp` · `csharp` · `java` · `kotlin` · `swift` · `ruby` · `php` ·
`css` · `scss` · `html` · `vue` · `svelte` · `json` · `yaml` · `toml` ·
`markdown` · `bash` · `sql` · `graphql`

Pass the extension → language id mapping helper if needed:

```tsx
import { extToLang } from 'pretext-editor'

const lang = extToLang('ts') // → "typescript"
```

## Keyboard shortcuts

### Navigation

| Key | Action | Status |
|---|---|---|
| Arrow keys | Move cursor | ✅ |
| Shift + Arrow | Extend selection | ✅ |
| Home / End | Jump to line start / end | ✅ |
| Ctrl/⌘ + Home / End | Jump to file start / end | ✅ |
| Ctrl/⌘ + ← / → | Jump word left / right | ✅ |
| Page Up / Down | Move cursor one page up / down | ✅ |

### Editing

| Key | Action | Status |
|---|---|---|
| Backspace / Delete | Delete character backward / forward | ✅ |
| Ctrl/⌘ + Backspace | Delete word backward | ✅ |
| Ctrl/⌘ + Delete | Delete word forward | ✅ |
| Enter | Insert newline | ✅ |
| Ctrl/⌘ + Enter | Insert blank line below | ✅ |
| Ctrl/⌘ + Shift + Enter | Insert blank line above | ✅ |
| Tab | Indent (multi-line: indent all selected lines) | ✅ |
| Shift + Tab | Dedent (multi-line: dedent all selected lines) | ✅ |
| Ctrl/⌘ + Shift + K | Delete current line | ✅ |
| Alt + ↑ / ↓ | Move line(s) up / down | ✅ |
| Alt + Shift + ↑ / ↓ | Copy line(s) up / down | ✅ |
| Ctrl/⌘ + / | Toggle line comment | ✅ |

### Selection

| Key | Action | Status |
|---|---|---|
| Ctrl/⌘ + A | Select all | ✅ |
| Ctrl/⌘ + L | Select current line | ✅ |
| Ctrl/⌘ + D | Select next occurrence of current word/selection | ✅ |
| Ctrl/⌘ + Shift + L | Select all occurrences of current word/selection | ✅ |

### Clipboard

| Key | Action | Status |
|---|---|---|
| Ctrl/⌘ + C | Copy | ✅ |
| Ctrl/⌘ + X | Cut (cuts current line if no selection) | ✅ |
| Ctrl/⌘ + V | Paste | ✅ |

### History

| Key | Action | Status |
|---|---|---|
| Ctrl/⌘ + Z | Undo | ✅ |
| Ctrl/⌘ + Shift + Z / Ctrl + Y | Redo | ✅ |

## Mouse shortcuts

| Action | Behavior | Status |
|---|---|---|
| Click | Place cursor | ✅ |
| Click + Drag | Select text | ✅ |
| Shift + Click | Extend selection to click position | ✅ |
| Double-click | Select word under cursor | ✅ |
| Triple-click | Select entire line | ✅ |
| Alt + Click | Add cursor (multi-cursor) | ✅ |
| Alt + Shift + Click | Start column (box) selection | ✅ |
| Alt + Shift + Drag | Column (box) selection | ✅ |
| Ctrl + Alt + ↑ / ↓ | Add cursor above / below (keyboard multi-cursor) | ✅ |

## Performance architecture

### Current: line-based virtual rendering

The editor keeps all source lines in memory as a flat `string[]`. Rendering is
already virtual — `renderCanvas` only draws lines whose Y range intersects the
current viewport:

```
scrollTop ─────────────────┐
                           │  ← only these lines are measured + drawn
scrollTop + viewHeight ────┘
```

Canvas height is fixed to the viewport; a tall `<div>` inside the scroll
container provides the native scrollbar. This keeps rendering O(visible lines)
regardless of total file size.

### Planned: 50-line block cache for large files (> 60 KB)

For very large files, even storing `charWidth[]` per character for every line
becomes expensive. The planned optimization splits the document into **blocks of
~50 source lines**:

- Each block is laid out independently and its metrics cached.
- When the user edits a line, only the block containing that line is
  re-measured; all other blocks reuse their cached metrics.
- Blocks are loaded progressively using `requestIdleCallback` with a
  doubling threshold schedule: 200 → 400 → 800 → 1600 → 3200 → 6400 → 6400 …
  source lines per batch.
- A **generation counter** increments whenever block boundaries change
  (split when a block exceeds 100 lines, delete when it reaches 0). Idle
  callbacks capture the generation at dispatch time and discard their result
  if it no longer matches, preventing stale writes to the cache.

Block size rules:

| Condition | Action |
|---|---|
| Block grows > 100 lines | Split at line 50 into two blocks |
| Block shrinks to 0 lines | Delete the block |
| 1 – 100 lines | No structural change, mark dirty |
| Edit spans two blocks | Each block shrinks independently; no merge needed |
