# pretext-editor

A lightweight, high-performance Canvas-virtualized code editor with VS Code-style keyboard shortcuts, syntax highlighting, and multi-cursor editing.

Built on `@chenglou/pretext` + `shiki`. Integrates with **React** / **Vue 3** / **Angular** / **Svelte** / **plain HTML5**.

## Features

- **Canvas virtual scrolling** — fluid editing of 10,000+ line files; only visible lines are rendered
- **Syntax highlighting** — shiki-powered, 30+ languages (`dark-plus` theme)
- **VS Code shortcuts** — navigation, editing, selection, clipboard, history
- **Search & replace** — Ctrl+F search, Ctrl+H replace with case-sensitive / whole-word / regex toggles and progressive async search
- **Multi-cursor editing** — Alt+Click to add cursors, Ctrl+D to select next occurrence, Ctrl+Shift+L to select all
- **Column selection** — Alt+Shift+drag
- **Indent guides** — auto-detected indent unit with active-scope bracket highlighting
- **Undo / redo** — 200-entry snapshot stack
- **Instant response** — hidden textarea captures input, Canvas renders output, zero DOM diff overhead
- **IME support** — composition input handled correctly

## Install

```bash
npm install pretext-editor
```

## Quick Start

### React

```tsx
import { useState } from 'react'
import { PretextEditor } from 'pretext-editor/react'

function App() {
  const [code, setCode] = useState('console.log("hello")')
  return (
    <div style={{ height: '100vh' }}>
      <PretextEditor value={code} onChange={setCode} language="typescript" />
    </div>
  )
}
```

> Import from `pretext-editor/react`. The main entry `pretext-editor` exports only framework-agnostic core functions and `EditorController`.

### Vue 3

```vue
<template>
  <div style="height: 100vh">
    <PretextEditor :value="code" @update:value="code = $event" language="typescript" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PretextEditor } from 'pretext-editor/vue'

const code = ref('console.log("hello")')
</script>
```

> Import from `pretext-editor/vue`.

### Angular

Angular integrates directly with `EditorController`. Create the controller and mount it in `ngAfterViewInit`:

```typescript
import { Component, ViewChild, ElementRef, AfterViewInit, NgZone, ChangeDetectorRef } from '@angular/core'
import { EditorController, FONT_SIZE_TO_LINE_HEIGHT } from 'pretext-editor'

@Component({
  standalone: true,
  template: `
    <div #container class="editor-wrap">
      <div [style.height.px]="totalHeight" style="position:relative">
        <canvas #canvas style="position:sticky;top:0;display:block;width:100%"></canvas>
      </div>
      <textarea #textarea rows="1" style="position:absolute;opacity:0;pointer-events:none"></textarea>
    </div>
  `,
  styles: ['.editor-wrap { flex:1;position:relative;overflow:auto }'],
})
export class AppComponent implements AfterViewInit {
  @ViewChild('container') containerRef!: ElementRef
  @ViewChild('canvas') canvasRef!: ElementRef
  @ViewChild('textarea') textareaRef!: ElementRef

  code = 'console.log("hello")'
  totalHeight = 0
  private ctrl!: EditorController

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngAfterViewInit() {
    this.ngZone.runOutsideAngular(() => {
      this.ctrl = new EditorController({
        value: this.code,
        onChange: (v) => this.ngZone.run(() => this.code = v),
        language: 'typescript',
      })
      this.ctrl.mount(this.containerRef.nativeElement, this.canvasRef.nativeElement, this.textareaRef.nativeElement, () => {
        this.totalHeight = Math.max(1, this.ctrl.getState().doc.lines.length) * FONT_SIZE_TO_LINE_HEIGHT(14) + 16
        this.cdr.detectChanges()
      })
    })
  }
  ngOnDestroy() { this.ctrl?.destroy() }
}
```

> Angular has no dedicated sub-path. Import `EditorController` from `pretext-editor` and integrate it into your component. See `dist/angular/editor.component.ts` for a full reference implementation.

### Svelte

```svelte
<script lang="ts">
  import PretextEditor from 'pretext-editor/svelte'

  let code = $state('console.log("hello")')

  function handleChange(e: CustomEvent<string>) {
    code = e.detail
  }
</script>

<div style="height: 100vh">
  <PretextEditor value={code} language="typescript" on:change={handleChange} />
</div>
```

> Import from `pretext-editor/svelte`. The component dispatches a `change` event via `createEventDispatcher`. Use `bind:this` to get a handle reference.

### CommonJS

```javascript
const {
  fromString, toString, insert, deleteBackward, moveCursor,
  toggleLineComment, findAllOccurrences, extToLang,
} = require('pretext-editor')

// Pure Node.js — create, edit, search, toggle comments, no browser needed
const doc = fromString('function hello() {\n  console.log("hi")\n}')
const doc2 = insert(doc, '// comment\n')
const doc3 = moveCursor(doc2, 1, 0)
console.log(toString(doc3))
```

> The main entry `pretext-editor` exports only core functions and `EditorController`, with zero framework dependencies. Usable directly via `require` in Node.js.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | Required | Editor content |
| `onChange` / `@update:value` / `valueChange` / `on:change` | `(v: string) => void` | Required | Content change callback |
| `language` | `string` | — | Shiki language ID (`typescript`, `python`, `json`, …) |
| `fontSize` | `number` | `14` | Font size in px |
| `fontFamily` | `string` | `Menlo, Monaco, ...` | CSS monospace font |
| `tabSize` | `number` | `4` | Tab width in spaces |
| `binding` | `IEditorBinding` | — | Bidirectional scroll binding (for split-pane preview) |
| `active` | `boolean` | `false` | Whether this is the active panel |
| `contextMenuItems` | `(builtins) => ContextMenuItem[]` | — | Custom right-click context menu |
| `renderSearchBar` | `(state: SearchState, actions: SearchActions) => ReactNode` | — | Custom search bar (React / Vue) |

## Search

Press `Ctrl/Cmd+F` to open the search bar, `Ctrl/Cmd+H` to open with replace. `Escape` to close. `Enter` for next match, `Shift+Enter` for previous. React, Vue, and Svelte all ship a built-in search bar.

### Default UI

All framework components (React / Vue / Svelte) include a built-in search bar that floats top-right and does not scroll with content:

```tsx
<PretextEditor value={code} onChange={setCode} />
```

### Custom UI

Replace the default search bar via the `renderSearchBar` prop:

```tsx
import type { SearchState, SearchActions } from 'pretext-editor/react'

<PretextEditor
  value={code}
  onChange={setCode}
  renderSearchBar={(state: SearchState, actions: SearchActions) => (
    <MySearchBar state={state} actions={actions} />
  )}
/>
```

`SearchState` fields:

| Field | Type | Description |
|-------|------|-------------|
| `isOpen` | `boolean` | Whether the search bar is open |
| `query` | `string` | Current search query |
| `caseSensitive` | `boolean` | Case-sensitive flag |
| `wholeWord` | `boolean` | Whole-word match flag |
| `useRegex` | `boolean` | Regular expression flag |
| `matchCount` | `number` | Total match count |
| `currentIndex` | `number` | Index of the currently highlighted match (0-based, -1 = no match) |
| `showReplace` | `boolean` | Whether the replace row is visible |
| `replaceQuery` | `string` | Replacement text |
| `preserveCase` | `boolean` | Preserve case when replacing |
| `regexError` | `string \| null` | Regex error message, or null |
| `focusToken` | `number` | Incremented on each `openSearch()` call; used by components to detect re-focus |

`SearchActions` methods: `setQuery(q)` · `next()` · `prev()` · `close()` · `setCaseSensitive(v)` · `setWholeWord(v)` · `setUseRegex(v)` · `toggleReplace()` · `setReplaceQuery(q)` · `setPreserveCase(v)` · `replace()` · `replaceAll()`

### Framework-agnostic API

```ts
import { EditorController } from 'pretext-editor'

ctrl.openSearch()            // open (optionally pass initial query)
ctrl.setSearchQuery('foo')   // update query
ctrl.searchNext()            // next match
ctrl.searchPrev()            // previous match
ctrl.closeSearch()           // close
ctrl.setSearchCaseSensitive(true)

// search state is in ctrl.getState().searchState
```

---

## Handle Methods

```tsx
const ref = useRef<PretextEditorHandle>(null)
ref.current?.scrollToLine(42)
```

| Method | Description |
|--------|-------------|
| `getTopLine()` | First visible line number |
| `scrollToLine(line)` | Scroll to a specific line |
| `getVisibleLines()` | Visible line range `{ from, to }` |

## Core Functions (Framework-Agnostic)

```javascript
import {
  fromString, toString,            // Doc ↔ string
  insert,                          // insert text
  deleteBackward, deleteForward,   // delete
  moveCursor, moveWordLeft, moveWordRight,
  moveToLineStart, moveToLineEnd,
  moveLines, copyLines,            // Alt+↑↓ move/copy lines
  toggleLineComment,               // Ctrl+/
  findNextOccurrence, findAllOccurrences,
  extToLang,                       // extension → language ID
} from 'pretext-editor'
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ↑ ↓ ← → | Move cursor |
| Ctrl+← → | Move by word |
| Home / End | Line start / end |
| Ctrl+Home / End | File start / end |
| PageUp / Down | Scroll page |
| Shift+arrows | Extend selection |
| Ctrl+A | Select all |
| Ctrl+L | Select current line |
| Ctrl+D | Select next occurrence (multi-cursor) |
| Ctrl+Shift+L | Select all occurrences |
| Alt+Click | Add / remove extra cursor |
| Alt+Shift+drag | Column selection |
| Enter | New line |
| Backspace / Delete | Delete character |
| Ctrl+Backspace / Delete | Delete by word |
| Tab / Shift+Tab | Indent / dedent |
| Alt+↑ ↓ | Move current line |
| Alt+Shift+↑ ↓ | Copy current line |
| Ctrl+Enter | Insert line below |
| Ctrl+Shift+Enter | Insert line above |
| Ctrl+/ | Toggle line comment |
| Ctrl+Shift+K | Delete line |
| Ctrl+C / X / V | Copy / cut / paste |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+F | Open search bar |
| Ctrl+H | Open search with replace |
| Enter | Next match (when search bar is focused) |
| Shift+Enter | Previous match |
| Alt+C | Toggle case-sensitive (when search bar is focused) |
| Alt+W | Toggle whole-word |
| Alt+R | Toggle regex |
| Escape | Close search bar / cancel multi-cursor |

## Supported Languages

`typescript` · `tsx` · `javascript` · `jsx` · `python` · `rust` · `go` · `c` · `cpp` · `csharp` · `java` · `kotlin` · `swift` · `ruby` · `php` · `css` · `scss` · `html` · `vue` · `svelte` · `json` · `yaml` · `toml` · `markdown` · `bash` · `sql` · `graphql`

```tsx
import { extToLang } from 'pretext-editor'
extToLang('ts')   // → "typescript"
extToLang('py')   // → "python"
```

## Demos

```bash
cd demo/react    && npm install && npm run dev   # React + Vite
cd demo/vue      && npm install && npm run dev   # Vue 3 + Vite
cd demo/angular  && npm install && npm run dev   # Angular standalone
cd demo/svelte   && npm install && npm run dev   # Svelte + Vite
cd demo/vanilla  && npm install && npm run dev   # Plain HTML5, zero framework
```

## Performance

Only visible lines are drawn on Canvas — rendering cost is independent of file size. Large files are kept as an array of line strings, O(visible lines) rendering.

## License

MIT
