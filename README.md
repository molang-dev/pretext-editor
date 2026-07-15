# pretext-editor

A lightweight, high-performance Canvas-virtualized code editor with VS Code-style keyboard shortcuts, syntax highlighting, and multi-cursor editing.

Built on `@chenglou/pretext` + `shiki`. Integrates with **React** / **Vue 3** / **Svelte** / **Angular**.

## Features

- **Canvas virtual scrolling** — fluid editing of 10,000+ line files; only visible lines are rendered
- **Syntax highlighting** — shiki-powered, 30+ languages
- **VS Code shortcuts** — navigation, editing, selection, clipboard, history
- **Search & replace** — Ctrl+F / Ctrl+H with case-sensitive / whole-word / regex toggles
- **Multi-cursor editing** — Alt+Click, Ctrl+D (next occurrence), Ctrl+Shift+L (all occurrences)
- **Column selection** — Alt+Shift+drag
- **Indent guides** — auto-detected indent unit with active-scope bracket highlighting
- **Undo / redo** — 200-entry snapshot stack
- **IME support** — composition input handled correctly

## Install

```bash
npm install pretext-editor
```

## Framework Support

| Framework | Extra setup needed |
|-----------|-------------------|
| React | None — import and use |
| Vue 3 | None — import and use |
| Svelte | None — import and use |
| Angular | Copy `editor.component.ts` + create Worker |
| Vanilla / no framework | Use `EditorController` directly |

React, Vue, and Svelte all require one line in your Vite config (see below). Angular does not use Vite.

## Vite Setup (React / Vue / Svelte)

Add one line to your `vite.config.ts`:

```ts
export default defineConfig({
  optimizeDeps: { exclude: ['pretext-editor'] },
})
```

This prevents Vite from pre-bundling the package with esbuild, which would break the syntax-highlighting worker.

---

## React

```tsx
import { PretextEditor } from 'pretext-editor/react'
import 'pretext-editor/react/index.css'

function App() {
  return (
    <div style={{ height: '100vh' }}>
      <PretextEditor value="console.log('hello')" language="typescript" />
    </div>
  )
}
```

The component is **uncontrolled for typing** — you pass `value` to set initial content or to replace it externally (e.g. loading a file), but you do not need to sync state on every keystroke.

To react to edits, use `onChanged`:

```tsx
<PretextEditor
  value={code}
  language="typescript"
  onChanged={(r1, c1, r2, c2, oldValue, newValue) => {
    setCode(newValue)
  }}
/>
```

To get a handle for scrolling:

```tsx
const ref = useRef<PretextEditorHandle>(null)
<PretextEditor ref={ref} value={code} language="typescript" />
ref.current?.scrollToLine(42)
```

---

## Vue 3

```vue
<template>
  <div style="height: 100vh">
    <PretextEditor v-model:value="code" language="typescript" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { PretextEditor } from 'pretext-editor/vue'
import 'pretext-editor/vue/index.css'

const code = ref("console.log('hello')")
</script>
```

`v-model:value` is shorthand for `:value="code" @update:value="code = $event"`. The component also emits `@cursor-change`.

---

## Svelte

```svelte
<script lang="ts">
  import PretextEditor from 'pretext-editor/svelte'

  let code = "console.log('hello')"

  function handleChange(e: CustomEvent<string>) {
    code = e.detail
  }
</script>

<div style="height: 100vh">
  <PretextEditor value={code} language="typescript" on:change={handleChange} />
</div>
```

The component dispatches a `change` CustomEvent with the new string value. Use `bind:this` to get a handle reference.

---

## Angular

Angular requires two extra steps: copy the component into your project, and create the highlight worker yourself.

**Step 1** — Copy the component file:

```bash
cp node_modules/pretext-editor/dist/angular/editor.component.ts src/app/pretext-editor/editor.component.ts
```

**Step 2** — Use it in your component, passing a Worker via `[worker]`:

```typescript
import { Component } from '@angular/core'
import { PretextEditorComponent } from './pretext-editor/editor.component'

@Component({
  standalone: true,
  imports: [PretextEditorComponent],
  template: `
    <pretext-editor
      [value]="code"
      [worker]="worker"
      language="typescript"
      (valueChange)="code = $event"
      style="height: 100vh; display: block"
    />
  `,
})
export class AppComponent {
  code = "console.log('hello')"

  readonly worker = typeof Worker !== 'undefined'
    ? new Worker(
        new URL(
          // Adjust the relative path to match your component file's location
          '../../node_modules/pretext-editor/dist/highlight.worker.bundle.js',
          import.meta.url,
        ),
        { type: 'module' },
      )
    : undefined
}
```

Create the Worker at class level (not inside a lifecycle hook) so WASM loading starts before the editor mounts.

---

## Vanilla / No Framework

Use `EditorController` directly:

```javascript
import { EditorController } from 'pretext-editor'
import { createWorker } from 'pretext-editor/worker-create'

const container = document.querySelector('.editor-scroll')
const canvas    = document.querySelector('.editor-canvas')
const textarea  = document.querySelector('.editor-textarea')
const content   = document.querySelector('.editor-content')

const ctrl = new EditorController({
  value: "console.log('hello')",
  language: 'typescript',
  worker: createWorker(),
})

ctrl.mount(container, canvas, textarea, () => {
  // called on every state change — update your own UI here
  const state = ctrl.getState()
}, content)
```

You are responsible for the DOM structure (`.editor-scroll`, `.editor-canvas`, `.editor-textarea`, `.editor-content`) and CSS. See `demo/vanilla/` for a full example.

---

## Props

| Prop | React | Vue | Svelte | Angular | Type | Default |
|------|-------|-----|--------|---------|------|---------|
| `value` | ✓ | ✓ | ✓ | ✓ | `string` | required |
| `language` | ✓ | ✓ | ✓ | ✓ | `string` | — |
| `theme` | ✓ | ✓ | ✓ | ✓ | `string` | `'dark-plus'` |
| `fontSize` | ✓ | ✓ | ✓ | ✓ | `number` | `14` |
| `fontFamily` | ✓ | ✓ | ✓ | ✓ | `string` | `Menlo, Monaco, …` |
| `tabSize` | ✓ | ✓ | ✓ | ✓ | `number` | `4` |
| `wordWrap` | ✓ | ✓ | ✓ | ✓ | `boolean` | `false` |
| `worker` | — | — | — | ✓ | `Worker` | — |
| `binding` | ✓ | ✓ | ✓ | — | `IEditorBinding` | — |
| `active` | ✓ | ✓ | ✓ | — | `boolean` | `false` |
| `contextMenuItems` | ✓ | ✓ | ✓ | — | `(builtins) => ContextMenuItem[]` | — |
| `renderSearchBar` | ✓ | ✓ | — | — | `(state, actions) => ReactNode` | — |

**Change callbacks:**

| Framework | Callback |
|-----------|----------|
| React | `onChanged?: (r1, c1, r2, c2, oldValue, newValue) => void` |
| Vue | `@update:value="handler"` (or `v-model:value`) |
| Svelte | `on:change` — `CustomEvent<string>` |
| Angular | `(valueChange)="handler($event)"` |

## Themes

Built-in values for `theme`: `'dark-plus'` · `'dracula'` · `'github-light'`

## Handle Methods

```tsx
// React
const ref = useRef<PretextEditorHandle>(null)
ref.current?.scrollToLine(42)

// Vue
const editorRef = ref<PretextEditorHandle>()

// Svelte
let editorRef: PretextEditorHandle
<PretextEditor bind:this={editorRef} ... />
```

| Method | Description |
|--------|-------------|
| `getTopLine()` | First visible line number (0-based) |
| `scrollToLine(line)` | Scroll to a specific line |
| `getVisibleLines()` | `{ from, to }` visible line range |

## Custom Search Bar (React / Vue)

```tsx
import type { SearchState, SearchActions } from 'pretext-editor/react'

<PretextEditor
  value={code}
  renderSearchBar={(state: SearchState, actions: SearchActions) => (
    <MySearchBar state={state} actions={actions} />
  )}
/>
```

`SearchActions` methods: `setQuery` · `next` · `prev` · `close` · `setCaseSensitive` · `setWholeWord` · `setUseRegex` · `toggleReplace` · `setReplaceQuery` · `setPreserveCase` · `replace` · `replaceAll`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| ↑ ↓ ← → | Move cursor |
| Ctrl+← → | Move by word |
| Home / End | Line start / end |
| Ctrl+Home / End | File start / end |
| Shift+arrows | Extend selection |
| Ctrl+A | Select all |
| Ctrl+L | Select current line |
| Ctrl+D | Select next occurrence |
| Ctrl+Shift+L | Select all occurrences |
| Alt+Click | Add / remove cursor |
| Alt+Shift+drag | Column selection |
| Ctrl+Backspace / Delete | Delete by word |
| Tab / Shift+Tab | Indent / dedent |
| Alt+↑ ↓ | Move line up / down |
| Alt+Shift+↑ ↓ | Copy line up / down |
| Ctrl+Enter | Insert line below |
| Ctrl+Shift+Enter | Insert line above |
| Ctrl+/ | Toggle line comment |
| Ctrl+Shift+K | Delete line |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+F | Open search |
| Ctrl+H | Open search with replace |

## Supported Languages

`typescript` · `tsx` · `javascript` · `jsx` · `python` · `rust` · `go` · `c` · `cpp` · `csharp` · `java` · `kotlin` · `swift` · `ruby` · `php` · `css` · `scss` · `less` · `html` · `vue` · `svelte` · `json` · `jsonc` · `yaml` · `toml` · `markdown` · `bash` · `sql` · `graphql` · `lua` · `dart` · `scala` · `r` · `haml` · `glsl`

```ts
import { extToLang } from 'pretext-editor'
extToLang('ts')  // → 'typescript'
extToLang('py')  // → 'python'
```

## Demos

```bash
cd demo/react    && npm install && npm run dev   # React + Vite
cd demo/vue      && npm install && npm run dev   # Vue 3 + Vite
cd demo/svelte   && npm install && npm run dev   # Svelte + Vite
cd demo/angular  && npm install && npm run dev   # Angular
cd demo/vanilla  && npm install && npm run build # Vanilla — open index.html after build
```

## License

MIT
