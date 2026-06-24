# pretext-editor

基于 Canvas 虚拟滚动的轻量级高性能代码编辑器，支持 VSCode 风格的快捷键、语法高亮、多光标编辑。

底层使用 `@chenglou/pretext` + `shiki`，提供 **React** / **Vue 3** / **Angular** / **Svelte** / **纯 HTML5** 五种集成方式。

## 特性

- **Canvas 虚拟滚动** — 万行级大文件流畅编辑，只渲染可见行
- **语法高亮** — 基于 shiki，支持 30+ 语言（`dark-plus` 主题）
- **VSCode 快捷键** — 导航、编辑、选择、剪贴板、历史
- **搜索替换** — Ctrl+F 搜索，Ctrl+H 替换，支持大小写/全词/正则，渐进式异步搜索
- **多光标编辑** — Alt+Click 添加光标，Ctrl+D 逐个选中相同词，Ctrl+Shift+L 全选
- **列选择** — Alt+Shift+拖拽
- **缩进引导线** — 自动检测缩进单位，光标所在作用域高亮
- **撤销/重做** — 200 步快照堆栈
- **即时响应** — 隐藏 textarea 劫持输入，Canvas 渲染，无 DOM diff 开销
- **IME 支持** — 组合输入正常处理

## 安装

```bash
npm install pretext-editor
```

## 快速开始

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

> React 导入使用 `pretext-editor/react` 子路径。主入口 `pretext-editor` 仅导出框架无关的核心函数和 `EditorController`。

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

> Vue 导入使用 `pretext-editor/vue` 子路径。

### Angular

Angular 使用 `EditorController` 直接集成。在组件中创建 controller，通过 `ngAfterViewInit` 挂载到 DOM：

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

> Angular 无独立子路径。直接 `import { EditorController } from 'pretext-editor'`，在组件中集成。完整的参考实现见 `dist/angular/editor.component.ts`。

### Svelte

```ts
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

> Svelte 导入使用 `pretext-editor/svelte` 子路径。组件通过 `createEventDispatcher` 派发 `change` 事件，通过 `bind:this` 获取 handle 引用。

### CommonJS

```javascript
const {
  fromString, toString, insert, deleteBackward, moveCursor,
  toggleLineComment, findAllOccurrences, extToLang,
} = require('pretext-editor')

// 纯 Node.js — 文档创建、编辑、查找、注释切换，无需浏览器
const doc = fromString('function hello() {\n  console.log("hi")\n}')
const doc2 = insert(doc, '// comment\n')
const doc3 = moveCursor(doc2, 1, 0)
console.log(toString(doc3))
```

> 主入口 `pretext-editor` 仅导出核心函数和 `EditorController`，无框架依赖，Node.js 环境可直接 `require`。

## Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | `string` | 必填 | 编辑器内容 |
| `onChange` / `@update:value` / `valueChange` / `on:change` | `(v: string) => void` | 必填 | 内容变化回调 |
| `language` | `string` | — | Shiki 语言 ID（`typescript`, `python`, `json` …） |
| `fontSize` | `number` | `14` | 字体大小（px） |
| `fontFamily` | `string` | `Menlo, Monaco, ...` | CSS 等宽字体 |
| `tabSize` | `number` | `4` | Tab 宽度（空格数） |
| `binding` | `IEditorBinding` | — | 双向滚动绑定（用于双栏预览） |
| `active` | `boolean` | `false` | 是否活跃面板 |
| `contextMenuItems` | `(builtins) => ContextMenuItem[]` | — | 自定义右键菜单 |
| `renderSearchBar` | `(state: SearchState, actions: SearchActions) => ReactNode` | — | 自定义搜索栏（React / Vue） |

## 搜索

按 `Ctrl/Cmd+F` 打开搜索框，`Ctrl/Cmd+H` 打开替换。`Escape` 关闭。`Enter` 跳下一个，`Shift+Enter` 跳上一个。React、Vue、Svelte 均内建搜索栏 UI，开箱即用。

### 默认 UI

所有框架组件（React / Vue / Svelte）均自带搜索栏，右上角浮层不随内容滚动：

```tsx
<PretextEditor value={code} onChange={setCode} />
```

### 自定义 UI

通过 `renderSearchBar` prop 完全替换默认搜索框：

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

`SearchState` 字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `isOpen` | `boolean` | 搜索框是否打开 |
| `query` | `string` | 当前搜索词 |
| `caseSensitive` | `boolean` | 是否大小写敏感 |
| `wholeWord` | `boolean` | 是否全词匹配 |
| `useRegex` | `boolean` | 是否正则表达式 |
| `matchCount` | `number` | 匹配总数 |
| `currentIndex` | `number` | 当前高亮的匹配索引（0-based，-1 表示无匹配） |
| `showReplace` | `boolean` | 是否显示替换行 |
| `replaceQuery` | `string` | 替换文本 |
| `preserveCase` | `boolean` | 替换时保留大小写 |
| `regexError` | `string \| null` | 正则表达式错误信息 |
| `focusToken` | `number` | 每次 `openSearch()` 调用时递增，用于组件检测重新聚焦 |

`SearchActions` 方法：`setQuery(q)` · `next()` · `prev()` · `close()` · `setCaseSensitive(v)` · `setWholeWord(v)` · `setUseRegex(v)` · `toggleReplace()` · `setReplaceQuery(q)` · `setPreserveCase(v)` · `replace()` · `replaceAll()`

### 框架无关用法

```ts
import { EditorController } from 'pretext-editor'

ctrl.openSearch()            // 打开（可选传初始 query）
ctrl.setSearchQuery('foo')   // 更新搜索词
ctrl.searchNext()            // 下一个
ctrl.searchPrev()            // 上一个
ctrl.closeSearch()           // 关闭
ctrl.setSearchCaseSensitive(true)

// 搜索状态在 ctrl.getState().searchState 中
```

---

## Handle 方法

```tsx
const ref = useRef<PretextEditorHandle>(null)
ref.current?.scrollToLine(42)
```

| 方法 | 说明 |
|------|------|
| `getTopLine()` | 可视区域第一行行号 |
| `scrollToLine(line)` | 滚动到指定行 |
| `getVisibleLines()` | 可视区域行范围 `{ from, to }` |

## 核心函数（框架无关）

```javascript
import {
  fromString, toString,            // Doc ↔ string
  insert,                          // 插入文本
  deleteBackward, deleteForward,   // 删除
  moveCursor, moveWordLeft, moveWordRight,
  moveToLineStart, moveToLineEnd,
  moveLines, copyLines,            // Alt+↑↓ 移动/复制行
  toggleLineComment,               // Ctrl+/
  findNextOccurrence, findAllOccurrences,
  extToLang,                       // 扩展名 → 语言 ID
} from 'pretext-editor'
```

## 键盘快捷键

| 快捷键 | 操作 |
|--------|------|
| ↑ ↓ ← → | 移动光标 |
| Ctrl+← → | 按单词移动 |
| Home / End | 行首 / 行尾 |
| Ctrl+Home / End | 文件首 / 文件尾 |
| PageUp / Down | 翻页 |
| Shift+方向键 | 扩展选区 |
| Ctrl+A | 全选 |
| Ctrl+L | 选中当前行 |
| Ctrl+D | 选中下一个相同词（多光标） |
| Ctrl+Shift+L | 全选所有匹配 |
| Alt+Click | 添加/移除额外光标 |
| Alt+Shift+拖拽 | 列选择 |
| Enter | 换行 |
| Backspace / Delete | 删除字符 |
| Ctrl+Backspace / Delete | 按单词删除 |
| Tab / Shift+Tab | 缩进/反缩进 |
| Alt+↑ ↓ | 移动当前行 |
| Alt+Shift+↑ ↓ | 复制当前行 |
| Ctrl+Enter | 下方插入行 |
| Ctrl+Shift+Enter | 上方插入行 |
| Ctrl+/ | 切换行注释 |
| Ctrl+Shift+K | 删除行 |
| Ctrl+C / X / V | 复制 / 剪切 / 粘贴 |
| Ctrl+Z / Ctrl+Y | 撤销 / 重做 |
| Ctrl+F | 打开搜索框 |
| Ctrl+H | 打开搜索并展开替换行 |
| Enter | 下一个匹配（搜索栏聚焦时） |
| Shift+Enter | 上一个匹配 |
| Alt+C | 切换大小写敏感（搜索栏聚焦时） |
| Alt+W | 切换全词匹配 |
| Alt+R | 切换正则 |
| Escape | 关闭搜索框 / 取消多光标 |

## 支持的语言

`typescript` · `tsx` · `javascript` · `jsx` · `python` · `rust` · `go` · `c` · `cpp` · `csharp` · `java` · `kotlin` · `swift` · `ruby` · `php` · `css` · `scss` · `html` · `vue` · `svelte` · `json` · `yaml` · `toml` · `markdown` · `bash` · `sql` · `graphql`

```tsx
import { extToLang } from 'pretext-editor'
extToLang('ts')   // → "typescript"
extToLang('py')   // → "python"
```

## Demo

```bash
cd demo/react    && npm install && npm run dev   # React + Vite
cd demo/vue      && npm install && npm run dev   # Vue 3 + Vite
cd demo/angular  && npm install && npm run dev   # Angular standalone
cd demo/svelte   && npm install && npm run dev   # Svelte + Vite
cd demo/vanilla  && npm install && npm run dev   # 纯 HTML5（零框架）
```

## 性能

Canvas 只绘制可视行，渲染开销与文件大小无关。大文件读入保持行字符串数组，O(visible lines) 渲染。

## License

MIT
