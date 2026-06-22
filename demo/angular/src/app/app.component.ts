import { Component, ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core'
import { EditorController } from 'pretext-editor'
import { FONT_SIZE_TO_LINE_HEIGHT } from 'pretext-editor'
import type { ContextMenuItem } from 'pretext-editor'

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

      <div #container class="editor-wrap">
        <div [style.height.px]="totalHeight" style="position:relative">
          <canvas #canvas style="position:sticky;top:0;display:block;width:100%"></canvas>
        </div>

        @if (menuPos) {
          <div class="ctx-menu" [style.left.px]="menuPos.x" [style.top.px]="menuPos.y">
            @for (item of resolvedMenuItems; track $index) {
              @if (item.separator) {
                <div class="ctx-sep"></div>
              } @else {
                <div class="ctx-item"
                  [class.disabled]="item.disabled"
                  (click)="onMenuItemClick(item)">
                  {{ item.label }}
                </div>
              }
            }
          </div>
        }

        <textarea #textarea rows="1" class="hidden-input"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </textarea>
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
    .editor-wrap { flex: 1; position: relative; overflow: auto; outline: none; cursor: text; }
    .hidden-input {
      position: absolute; top: 0; left: 0; width: 1px; height: 1px;
      opacity: 0; overflow: hidden; resize: none; border: none;
      outline: none; padding: 0; pointer-events: none;
    }
    .ctx-menu {
      position: fixed; background: #252526; border: 1px solid #454545;
      border-radius: 8px; padding: 4px 0; z-index: 9999; min-width: 160px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4); user-select: none;
    }
    .ctx-sep { height: 1px; background: #454545; margin: 4px 0; }
    .ctx-item {
      padding: 5px 20px; font-size: 13px; color: #cccccc; cursor: pointer; background: transparent;
    }
    .ctx-item.disabled { color: #5a5a5a; cursor: default; }
  `],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  code = SAMPLE_CODE
  language = 'typescript'

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>
  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>

  menuPos: { x: number; y: number } | null = null
  resolvedMenuItems: ContextMenuItem[] = []
  totalHeight = 0

  private ctrl!: EditorController

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
}
