import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core'
import { EditorController } from 'pretext-editor'
import { FONT_SIZE_TO_LINE_HEIGHT } from 'pretext-editor'
import type { ContextMenuItem, SearchState } from 'pretext-editor'

const LANGUAGES = [
  { value: 'c',           label: 'C' },
  { value: 'cpp',         label: 'C++' },
  { value: 'csharp',      label: 'C#' },
  { value: 'css',         label: 'CSS' },
  { value: 'dart',        label: 'Dart' },
  { value: 'fish',        label: 'Fish' },
  { value: 'glsl',        label: 'GLSL' },
  { value: 'go',          label: 'Go' },
  { value: 'graphql',     label: 'GraphQL' },
  { value: 'haml',        label: 'Haml' },
  { value: 'html',        label: 'HTML' },
  { value: 'java',        label: 'Java' },
  { value: 'javascript',  label: 'JavaScript' },
  { value: 'json',        label: 'JSON' },
  { value: 'jsonc',       label: 'JSONC' },
  { value: 'jsx',         label: 'JSX' },
  { value: 'kotlin',      label: 'Kotlin' },
  { value: 'less',        label: 'Less' },
  { value: 'lua',         label: 'Lua' },
  { value: 'markdown',    label: 'Markdown' },
  { value: 'php',         label: 'PHP' },
  { value: 'postcss',     label: 'PostCSS' },
  { value: 'python',      label: 'Python' },
  { value: 'r',           label: 'R' },
  { value: 'ruby',        label: 'Ruby' },
  { value: 'rust',        label: 'Rust' },
  { value: 'scala',       label: 'Scala' },
  { value: 'scss',        label: 'SCSS' },
  { value: 'shellscript', label: 'Shell Script' },
  { value: 'sql',         label: 'SQL' },
  { value: 'svelte',      label: 'Svelte' },
  { value: 'swift',       label: 'Swift' },
  { value: 'toml',        label: 'TOML' },
  { value: 'tsx',         label: 'TSX' },
  { value: 'typescript',  label: 'TypeScript' },
  { value: 'vue',         label: 'Vue' },
  { value: 'xml',         label: 'XML' },
  { value: 'yaml',        label: 'YAML' },
]

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rs: 'rust', go: 'go',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', java: 'java', kt: 'kotlin', swift: 'swift',
  css: 'css', html: 'html', htm: 'html', xml: 'xml',
  graphql: 'graphql', gql: 'graphql',
  sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', fish: 'fish',
  lua: 'lua', yaml: 'yaml', yml: 'yaml', rb: 'ruby',
  json: 'json', jsonc: 'jsonc', php: 'php', r: 'r', dart: 'dart',
  scala: 'scala', scss: 'scss', less: 'less',
  vue: 'vue', svelte: 'svelte', toml: 'toml',
  md: 'markdown', mdx: 'markdown', sql: 'sql',
  haml: 'haml', glsl: 'glsl', vert: 'glsl', frag: 'glsl',
}

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

const FONT_SIZE_OPTIONS: number[] = []
for (let n = 5; n <= 40; n += 2) FONT_SIZE_OPTIONS.push(n)

@Component({
  standalone: true,
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">
      <div class="toolbar">
        <b class="brand">pretext-editor</b>
        <span class="tag">Angular Demo</span>

        <label class="ctrl-label">
          Language:
          <select (change)="onLanguageChange($event)" class="ctrl-select" [value]="language">
            @for (lang of languages; track lang.value) {
              <option [value]="lang.value">{{ lang.label }}</option>
            }
          </select>
        </label>

        <label class="ctrl-label">
          Theme:
          <select (change)="onThemeChange($event)" class="ctrl-select" [value]="theme">
            <option value="dark-plus">Dark+ (VS Code)</option>
            <option value="dracula">Dracula</option>
            <option value="github-light">GitHub Light</option>
          </select>
        </label>

        <label class="ctrl-label">
          Font size:
          <select (change)="onFontSizeChange($event)" class="ctrl-select ctrl-select--narrow" [value]="fontSize">
            @for (n of fontSizeOptions; track n) {
              <option [value]="n">{{ n }}</option>
            }
          </select>
        </label>

        <button class="btn" (click)="openFile()">Open File</button>
        <button class="btn" [class.btn--active]="wordWrap" (click)="toggleWordWrap()">换行</button>
        <input #fileInput type="file" class="file-input-hidden" (change)="onFileChange($event)" />
      </div>

      <div class="editor-wrap-shell">
        <div class="pretext-editor">
          <div #container class="editor-scroll">
            <div #content [style.height.px]="totalHeight" class="editor-content">
              <canvas #canvas class="editor-canvas"></canvas>
            </div>

            @if (menuPos) {
              <div class="contextmenu" [style.left.px]="menuPos.x" [style.top.px]="menuPos.y">
                @for (item of resolvedMenuItems; track $index) {
                  @if (item.separator) {
                    <div class="contextmenu-separator"></div>
                  } @else {
                    <div class="contextmenu-item"
                      [class.contextmenu-item--disabled]="item.disabled"
                      (click)="onMenuItemClick(item)">
                      {{ item.label }}
                    </div>
                  }
                }
              </div>
            }

            <textarea #textarea rows="1" class="editor-textarea"
              autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
              (keydown)="onKeyDown($event)"
              (compositionstart)="onCompositionStart()"
              (compositionend)="onCompositionEnd($event)">
            </textarea>
          </div>

          @if (searchState.isOpen) {
            <div class="searchbar">
              <div class="searchbar-row">
                <button class="button button--narrow"
                  [title]="searchState.showReplace ? 'Collapse Replace' : 'Expand Replace'"
                  (click)="toggleReplace()">
                  <span class="icon icon-chevrondown"
                    [class.icon-chevrondown--collapsed]="!searchState.showReplace">
                  </span>
                </button>
                <div class="searchbar-inputwrap">
                  <input #findInput
                    [value]="searchState.query"
                    (input)="onFindInput($event)"
                    (keydown)="onFindKeyDown($event)"
                    placeholder="Find"
                    [title]="searchState.regexError ?? ''"
                    class="searchbar-input searchbar-findinput"
                    [class.searchbar-input--nomatches]="noMatches()"
                    [class.searchbar-input--error]="searchState.regexError">
                  <div class="searchbar-toggles">
                    <button class="button" [class.button--active]="searchState.caseSensitive" title="Match Case (Alt+C)" (click)="toggleCaseSensitive()"><span class="icon icon-casesensitive"></span></button>
                    <button class="button" [class.button--active]="searchState.wholeWord" title="Match Whole Word (Alt+W)" (click)="toggleWholeWord()"><span class="icon icon-wholeword"></span></button>
                    <button class="button" [class.button--active]="searchState.useRegex" title="Use Regular Expression (Alt+R)" (click)="toggleUseRegex()"><span class="icon icon-regex"></span></button>
                  </div>
                </div>
                <span class="searchbar-count" [class.searchbar-count--error]="!!searchState.regexError || noMatches()">{{ countText() }}</span>
                <div class="searchbar-buttons">
                  <button class="button" title="Previous Match (Shift+Enter)" [disabled]="searchState.matchCount === 0" (click)="searchPrev()"><span class="icon icon-arrowup"></span></button>
                  <button class="button" title="Next Match (Enter)" [disabled]="searchState.matchCount === 0" (click)="searchNext()"><span class="icon icon-arrowdown"></span></button>
                  <button class="button" title="Close (Escape)" (click)="closeSearch()"><span class="icon icon-close"></span></button>
                </div>
              </div>
              @if (searchState.showReplace) {
                <div class="searchbar-row">
                  <div class="searchbar-spacer"></div>
                  <div class="searchbar-inputwrap">
                    <input #replaceInput [value]="searchState.replaceQuery" (input)="onReplaceInput($event)" (keydown)="onReplaceKeyDown($event)" placeholder="Replace" class="searchbar-input searchbar-replaceinput" [class.searchbar-input--nomatches]="noMatches()">
                    <div class="searchbar-overlay">
                      <button class="button" [class.button--active]="searchState.preserveCase" title="Preserve Case (AB)" [disabled]="searchState.useRegex" (click)="togglePreserveCase()"><span class="icon icon-preservecase"></span></button>
                    </div>
                  </div>
                  <div class="searchbar-buttons">
                    <button class="button" title="Replace (Enter)" [disabled]="searchState.matchCount === 0 || !!searchState.regexError" (click)="replaceOne()"><span class="icon icon-replace"></span></button>
                    <button class="button" title="Replace All (Ctrl+Alt+Enter)" [disabled]="searchState.matchCount === 0 || !!searchState.regexError" (click)="replaceAll()"><span class="icon icon-replaceall"></span></button>
                  </div>
                </div>
              }
              @if (searchState.regexError) {
                <div class="searchbar-error">{{ searchState.regexError }}</div>
              }
            </div>
          }
        </div>
      </div>

      <div class="statusbar">
        <span>行 {{ cursor.line + 1 }}, 列 {{ cursor.col + 1 }}</span>
        <span>Tab Size: {{ tabSize }}</span>
        <span>UTF-8</span>
        <span>{{ currentLanguageLabel() }}</span>
      </div>
    </div>
  `,
  styles: [`
    .app { height: 100vh; display: flex; flex-direction: column; }
    .toolbar {
      display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 8px 16px; background: #252526;
      border-bottom: 1px solid #333; font-size: 13px; flex-shrink: 0;
    }
    .brand { color: #0098ff; }
    .tag { color: #888; }
    .ctrl-label { display: flex; align-items: center; gap: 6px; color: #ccc; }
    .ctrl-label:first-of-type { margin-left: auto; }
    .ctrl-select {
      background: #3c3c3c; color: #ccc; border: 1px solid #555;
      border-radius: 4px; padding: 4px 8px; font-size: 13px;
    }
    .ctrl-select--narrow { width: 64px; }
    .btn {
      background: #0e639c; color: #fff; border: none;
      border-radius: 4px; padding: 4px 12px; font-size: 13px; cursor: pointer;
    }
    .btn--active { background: #1177bb; outline: 1px solid #4fc3f7; }
    .editor-wrap-shell { flex: 1; position: relative; overflow: hidden; }
    .file-input-hidden { display: none; }
    .statusbar {
      display: flex; gap: 16px; align-items: center;
      padding: 2px 16px; background: #007acc; color: #fff;
      font-size: 12px; flex-shrink: 0; user-select: none;
    }
  `],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  code = SAMPLE_CODE
  language = 'typescript'
  theme = 'dark-plus'
  fontSize = 14
  tabSize = 4
  wordWrap = false
  cursor = { line: 0, col: 0 }

  languages = LANGUAGES
  fontSizeOptions = FONT_SIZE_OPTIONS

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>
  @ViewChild('content') contentRef!: ElementRef<HTMLDivElement>
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>
  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>
  @ViewChild('findInput') findInputRef!: ElementRef<HTMLInputElement>
  @ViewChild('replaceInput') replaceInputRef!: ElementRef<HTMLInputElement>
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>

  menuPos: { x: number; y: number } | null = null
  resolvedMenuItems: ContextMenuItem[] = []
  totalHeight = 0
  searchState: SearchState = {
    query: '', caseSensitive: false, wholeWord: false, useRegex: false,
    matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
    showReplace: false, replaceQuery: '', preserveCase: false,
    focusToken: 0,
  }

  private ctrl!: EditorController
  private hlWorker?: Worker

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.hlWorker = new Worker(
        new URL('../../node_modules/pretext-editor/dist/highlight.worker.js', import.meta.url),
        { type: 'module' }
      )
      this.ctrl = new EditorController({
        value: this.code,
        onChange: (v: string) => this.ngZone.run(() => { this.code = v }),
        language: this.language,
        theme: this.theme,
        fontSize: this.fontSize,
        tabSize: this.tabSize,
        wordWrap: this.wordWrap,
        worker: this.hlWorker,
      })
      this.ctrl.mount(
        this.containerRef.nativeElement,
        this.canvasRef.nativeElement,
        this.textareaRef.nativeElement,
        () => {
          const s = this.ctrl.getState()
          this.menuPos = s.menuPos
          this.resolvedMenuItems = s.menuItems
          this.totalHeight = Math.max(1, s.doc.lines.length) * FONT_SIZE_TO_LINE_HEIGHT(this.fontSize) + 16
          this.cursor = s.doc.cursor
          const wasClosed = !this.searchState.isOpen
          this.searchState = { ...s.searchState }
          if (wasClosed && this.searchState.isOpen) {
            requestAnimationFrame(() => {
              this.findInputRef?.nativeElement?.focus()
              this.findInputRef?.nativeElement?.select()
            })
          }
          this.cdr.detectChanges()
        },
        this.contentRef.nativeElement,
      )
    })
  }

  ngOnDestroy(): void {
    this.ctrl?.destroy()
    this.hlWorker?.terminate()
  }

  currentLanguageLabel(): string {
    return LANGUAGES.find(l => l.value === this.language)?.label ?? this.language
  }

  onLanguageChange(event: Event): void {
    this.language = (event.target as HTMLSelectElement).value
    this.ctrl?.updateOptions({ language: this.language })
  }

  onThemeChange(event: Event): void {
    this.theme = (event.target as HTMLSelectElement).value
    this.ctrl?.updateOptions({ theme: this.theme })
  }

  onFontSizeChange(event: Event): void {
    this.fontSize = Number((event.target as HTMLSelectElement).value)
    this.ctrl?.updateOptions({ fontSize: this.fontSize })
  }

  toggleWordWrap(): void {
    this.wordWrap = !this.wordWrap
    this.ctrl?.updateOptions({ wordWrap: this.wordWrap })
    this.cdr.detectChanges()
  }

  openFile(): void { this.fileInputRef?.nativeElement?.click() }

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const detected = EXT_TO_LANG[ext]
    if (detected) {
      this.language = detected
      this.ctrl?.updateOptions({ language: this.language })
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      this.ngZone.run(() => { this.code = text })
      this.ctrl?.setValue(text)
    }
    reader.readAsText(file)
    ;(event.target as HTMLInputElement).value = ''
  }

  onMenuItemClick(item: ContextMenuItem): void {
    if (!item.disabled) { item.onClick(); this.ctrl?.closeMenu() }
  }

  noMatches(): boolean {
    return !!this.searchState.query && !this.searchState.regexError && this.searchState.matchCount === 0
  }
  countText(): string {
    if (this.searchState.regexError) return ''
    if (this.searchState.matchCount === 0) return this.searchState.query ? 'No results' : ''
    return `${this.searchState.currentIndex + 1} of ${this.searchState.matchCount > 999 ? '999+' : this.searchState.matchCount}`
  }

  onFindInput(e: Event): void { this.ctrl?.setSearchQuery((e.target as HTMLInputElement).value) }
  onReplaceInput(e: Event): void { this.ctrl?.setReplaceQuery((e.target as HTMLInputElement).value) }
  searchNext(): void { this.ctrl?.searchNext() }
  searchPrev(): void { this.ctrl?.searchPrev() }
  closeSearch(): void { this.ctrl?.closeSearch() }
  toggleReplace(): void { this.ctrl?.toggleReplace() }
  toggleCaseSensitive(): void { this.ctrl?.setSearchCaseSensitive(!this.searchState.caseSensitive) }
  toggleWholeWord(): void { this.ctrl?.setSearchWholeWord(!this.searchState.wholeWord) }
  toggleUseRegex(): void { this.ctrl?.setSearchUseRegex(!this.searchState.useRegex) }
  togglePreserveCase(): void { this.ctrl?.setPreserveCase(!this.searchState.preserveCase) }
  replaceOne(): void { this.ctrl?.replace() }
  replaceAll(): void { this.ctrl?.replaceAll() }

  onFindKeyDown(e: KeyboardEvent): void {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase()
      if (k === 'c') { e.preventDefault(); this.toggleCaseSensitive(); return }
      if (k === 'w') { e.preventDefault(); this.toggleWholeWord(); return }
      if (k === 'r') { e.preventDefault(); this.toggleUseRegex(); return }
    }
    if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? this.searchPrev() : this.searchNext(); return }
    if (e.key === 'Escape') { e.preventDefault(); this.closeSearch(); return }
    e.stopPropagation()
  }

  onKeyDown(e: KeyboardEvent): void { this.ctrl?.onKeyDown(e) }
  onCompositionStart(): void { this.ctrl?.onCompositionStart() }
  onCompositionEnd(e: CompositionEvent): void { this.ctrl?.onCompositionEnd(e) }

  onReplaceKeyDown(e: KeyboardEvent): void {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase()
      if (k === 'c') { e.preventDefault(); this.toggleCaseSensitive(); return }
      if (k === 'w') { e.preventDefault(); this.toggleWholeWord(); return }
      if (k === 'r') { e.preventDefault(); this.toggleUseRegex(); return }
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') { e.preventDefault(); this.replaceAll(); return }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); this.replaceOne(); return }
    if (e.key === 'Escape') { e.preventDefault(); this.closeSearch(); return }
    e.stopPropagation()
  }
}
