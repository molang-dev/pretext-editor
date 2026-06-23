import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core'
import { EditorController } from 'pretext-editor'
import { FONT_SIZE_TO_LINE_HEIGHT } from 'pretext-editor'
import type { ContextMenuItem, SearchState, SearchActions } from 'pretext-editor'

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

// Test it
for (let i = 0; i < 10; i++) {
  console.log(\`fib(\${i}) = \${fibonacci(i)}\`)
}
`

@Component({
  standalone: true,
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="app">
      <div class="toolbar">
        <b class="brand">pretext-editor</b>
        <span class="tag">Angular Demo</span>

        <label class="lang-label">
          Language:
          <select (change)="onLanguageChange($event)" class="lang-select" [value]="language">
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="go">Go</option>
            <option value="rust">Rust</option>
            <option value="json">JSON</option>
            <option value="css">CSS</option>
            <option value="html">HTML</option>
          </select>
        </label>

        <button class="btn" (click)="scrollToTop()">Scroll to Top</button>
      </div>

      <div class="editor-wrap-shell">
        <div #container class="pteic-editor-scroll" style="position:relative;overflow:auto;outline:none;cursor:text">
          <div [style.height.px]="totalHeight" class="pteic-editor-content">
            <canvas #canvas class="pteic-editor-canvas"></canvas>
          </div>

          @if (menuPos) {
            <div class="pteic-cm" [style.left.px]="menuPos.x" [style.top.px]="menuPos.y">
              @for (item of resolvedMenuItems; track $index) {
                @if (item.separator) {
                  <div class="pteic-cm-separator"></div>
                } @else {
                  <div class="pteic-cm-item"
                    [class.pteic-cm-item--disabled]="item.disabled"
                    (click)="onMenuItemClick(item)">
                    {{ item.label }}
                  </div>
                }
              }
            </div>
          }

          <textarea #textarea rows="1" class="pteic-editor-textarea"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
          </textarea>
        </div>

        <!-- Search bar -->
        @if (searchState.isOpen) {
          <div class="pteic-sb">
            <!-- Find row -->
            <div class="pteic-sb-row">
              <button class="pteic-btn pteic-btn--narrow"
                [title]="searchState.showReplace ? 'Collapse Replace' : 'Expand Replace'"
                (click)="toggleReplace()">
                <span class="pteic pteic-chevron-down"
                  [class.pteic-chevron-down--collapsed]="!searchState.showReplace">
                </span>
              </button>

              <div class="pteic-sb-input-wrap">
                <input #findInput
                  [value]="searchState.query"
                  (input)="onFindInput($event)"
                  (keydown)="onFindKeyDown($event)"
                  placeholder="Find"
                  [title]="searchState.regexError ?? ''"
                  class="pteic-sb-input pteic-sb-find-input"
                  [class.pteic-sb-input--no-matches]="noMatches()"
                  [class.pteic-sb-input--error]="searchState.regexError">
                <div class="pteic-sb-toggles">
                  <button class="pteic-btn"
                    [class.pteic-btn--active]="searchState.caseSensitive"
                    title="Match Case (Alt+C)"
                    (click)="toggleCaseSensitive()">
                    <span class="pteic pteic-case-sensitive"></span>
                  </button>
                  <button class="pteic-btn"
                    [class.pteic-btn--active]="searchState.wholeWord"
                    title="Match Whole Word (Alt+W)"
                    (click)="toggleWholeWord()">
                    <span class="pteic pteic-whole-word"></span>
                  </button>
                  <button class="pteic-btn"
                    [class.pteic-btn--active]="searchState.useRegex"
                    title="Use Regular Expression (Alt+R)"
                    (click)="toggleUseRegex()">
                    <span class="pteic pteic-regex"></span>
                  </button>
                </div>
              </div>

              <span class="pteic-sb-count" [class.pteic-sb-count--error]="!!searchState.regexError || noMatches()">
                {{ countText() }}
              </span>

              <div class="pteic-sb-btns">
                <button class="pteic-btn" title="Previous Match (Shift+Enter)"
                  [disabled]="searchState.matchCount === 0"
                  (click)="searchPrev()">
                  <span class="pteic pteic-arrow-up"></span>
                </button>
                <button class="pteic-btn" title="Next Match (Enter)"
                  [disabled]="searchState.matchCount === 0"
                  (click)="searchNext()">
                  <span class="pteic pteic-arrow-down"></span>
                </button>
                <button class="pteic-btn" title="Close (Escape)"
                  (click)="closeSearch()">
                  <span class="pteic pteic-close"></span>
                </button>
              </div>
            </div>

            <!-- Replace row -->
            @if (searchState.showReplace) {
              <div class="pteic-sb-row">
                <div class="pteic-sb-spacer"></div>
                <div class="pteic-sb-input-wrap">
                  <input #replaceInput
                    [value]="searchState.replaceQuery"
                    (input)="onReplaceInput($event)"
                    (keydown)="onReplaceKeyDown($event)"
                    placeholder="Replace"
                    class="pteic-sb-input pteic-sb-replace-input"
                    [class.pteic-sb-input--no-matches]="noMatches()">
                  <div class="pteic-sb-overlay">
                    <button class="pteic-btn"
                      [class.pteic-btn--active]="searchState.preserveCase"
                      title="Preserve Case (AB)"
                      [disabled]="searchState.useRegex"
                      (click)="togglePreserveCase()">
                      <span class="pteic pteic-preserve-case"></span>
                    </button>
                  </div>
                </div>
                <div class="pteic-sb-btns">
                  <button class="pteic-btn" title="Replace (Enter)"
                    [disabled]="searchState.matchCount === 0 || !!searchState.regexError"
                    (click)="replaceOne()">
                    <span class="pteic pteic-replace"></span>
                  </button>
                  <button class="pteic-btn" title="Replace All (Ctrl+Alt+Enter)"
                    [disabled]="searchState.matchCount === 0 || !!searchState.regexError"
                    (click)="replaceAll()">
                    <span class="pteic pteic-replace-all"></span>
                  </button>
                </div>
              </div>
            }

            <!-- Regex error -->
            @if (searchState.regexError) {
              <div class="pteic-sb-error">{{ searchState.regexError }}</div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .app { height: 100vh; display: flex; flex-direction: column; }
    .toolbar {
      display: flex; align-items: center; gap: 12px;
      padding: 8px 16px; background: #252526;
      border-bottom: 1px solid #333; font-size: 13px; flex-shrink: 0;
    }
    .brand { color: #0098ff; }
    .tag { color: #888; }
    .lang-label { margin-left: auto; display: flex; align-items: center; gap: 6px; }
    .lang-select {
      background: #3c3c3c; color: #ccc; border: 1px solid #555;
      border-radius: 4px; padding: 4px 8px; font-size: 13px;
    }
    .btn {
      background: #0e639c; color: #fff; border: none;
      border-radius: 4px; padding: 4px 12px; font-size: 13px; cursor: pointer;
    }
    .editor-wrap-shell { flex: 1; position: relative; overflow: hidden; }
  `],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  code = SAMPLE_CODE
  language = 'typescript'

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>
  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>
  @ViewChild('findInput') findInputRef!: ElementRef<HTMLInputElement>
  @ViewChild('replaceInput') replaceInputRef!: ElementRef<HTMLInputElement>

  menuPos: { x: number; y: number } | null = null
  resolvedMenuItems: ContextMenuItem[] = []
  totalHeight = 0
  searchState: SearchState = {
    query: '', caseSensitive: false, wholeWord: false, useRegex: false,
    matchCount: 0, currentIndex: -1, isOpen: false, regexError: null,
    showReplace: false, replaceQuery: '', preserveCase: false,
  }

  private ctrl!: EditorController
  private searchOpenAtLastChange = false

  constructor(private cdr: ChangeDetectorRef, private ngZone: NgZone) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.ctrl = new EditorController({
        value: this.code,
        onChange: (v: string) => this.ngZone.run(() => { this.code = v }),
        language: this.language,
      })
      this.ctrl.mount(
        this.containerRef.nativeElement,
        this.canvasRef.nativeElement,
        this.textareaRef.nativeElement,
        () => {
          const s = this.ctrl.getState()
          this.menuPos = s.menuPos
          this.resolvedMenuItems = s.menuItems
          this.totalHeight = Math.max(1, s.doc.lines.length) * FONT_SIZE_TO_LINE_HEIGHT(14) + 16
          // Track search state changes
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
      )
    })
  }

  ngOnDestroy(): void { this.ctrl?.destroy() }

  onLanguageChange(event: Event): void {
    this.language = (event.target as HTMLSelectElement).value
    this.ctrl?.updateOptions({ language: this.language })
  }

  scrollToTop(): void { this.ctrl?.getHandle().scrollToLine(0) }

  onMenuItemClick(item: ContextMenuItem): void {
    if (!item.disabled) { item.onClick(); this.ctrl?.closeMenu() }
  }

  // ---- Search helpers ----
  noMatches(): boolean {
    return !!this.searchState.query && !this.searchState.regexError && this.searchState.matchCount === 0
  }
  countText(): string {
    if (this.searchState.regexError) return ''
    if (this.searchState.matchCount === 0) return this.searchState.query ? 'No results' : ''
    return `${this.searchState.currentIndex + 1} of ${this.searchState.matchCount > 999 ? '999+' : this.searchState.matchCount}`
  }

  // ---- Search actions ----
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

  onReplaceKeyDown(e: KeyboardEvent): void {
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = e.key.toLowerCase()
      if (k === 'c') { e.preventDefault(); this.toggleCaseSensitive(); return }
      if (k === 'w') { e.preventDefault(); this.toggleWholeWord(); return }
      if (k === 'r') { e.preventDefault(); this.toggleUseRegex(); return }
    }
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key === 'Enter') {
      e.preventDefault(); this.replaceAll(); return
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); this.replaceOne(); return
    }
    if (e.key === 'Escape') { e.preventDefault(); this.closeSearch(); return }
    e.stopPropagation()
  }
}
