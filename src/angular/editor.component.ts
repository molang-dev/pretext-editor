import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  NgZone,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnChanges,
  SimpleChanges,
} from '@angular/core'
import { EditorController } from '../controller/EditorController'
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TAB_SIZE,
} from '../core/renderer'
import type { ContextMenuItem, IEditorBinding, ContextMenuBuiltins } from '../controller/EditorController'

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'pretext-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #container
      style="position:relative;overflow:auto;height:100%;width:100%;outline:none;cursor:text"
      (click)="onContainerClick($event)">
      <div #content style="position:relative">
        <canvas #canvas style="position:sticky;top:0;display:block;width:100%"></canvas>
      </div>
      @if (menuPos) {
        <div
          style="position:fixed;background:#252526;border:1px solid #454545;border-radius:8px;
                 padding:4px 0;z-index:9999;min-width:160px;
                 box-shadow:0 4px 12px rgba(0,0,0,0.4);user-select:none"
          [style.left.px]="menuPos.x"
          [style.top.px]="menuPos.y">
          @for (item of resolvedMenuItems; track $index) {
            @if (item.separator) {
              <div style="height:1px;background:#454545;margin:4px 0"></div>
            } @else {
              <div
                (click)="onContextMenuItemClick(item)"
                [style.color]="item.disabled ? '#5a5a5a' : '#cccccc'"
                [style.cursor]="item.disabled ? 'default' : 'pointer'"
                style="padding:5px 20px;font-size:13px;background:transparent">
                {{ item.label }}
              </div>
            }
          }
        </div>
      }
      <textarea #textarea rows="1"
        style="position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;overflow:hidden;
               resize:none;border:none;outline:none;padding:0;pointer-events:none"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </textarea>
    </div>
  `,
  styles: [`:host { display: block; height: 100%; }`],
})
export class PretextEditorComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() value = ''
  @Input() language?: string
  @Input() fontSize: number = DEFAULT_FONT_SIZE
  @Input() fontFamily: string = DEFAULT_FONT_FAMILY
  @Input() tabSize: number = DEFAULT_TAB_SIZE
  @Input() binding?: IEditorBinding
  @Input() active = false
  @Input() contextMenuItemsFn?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
  @Output() valueChange = new EventEmitter<string>()

  @ViewChild('container') containerRef!: ElementRef<HTMLDivElement>
  @ViewChild('content') contentRef!: ElementRef<HTMLDivElement>
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>
  @ViewChild('textarea') textareaRef!: ElementRef<HTMLTextAreaElement>

  menuPos: { x: number; y: number } | null = null
  resolvedMenuItems: ContextMenuItem[] = []

  private ctrl!: EditorController

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      this.ctrl = new EditorController({
        value: this.value,
        onChange: (v: string) => this.ngZone.run(() => this.valueChange.emit(v)),
        language: this.language,
        fontSize: this.fontSize,
        fontFamily: this.fontFamily,
        tabSize: this.tabSize,
        binding: this.binding,
        active: this.active,
        contextMenuItems: this.contextMenuItemsFn,
      })
      this.ctrl.mount(
        this.containerRef.nativeElement,
        this.canvasRef.nativeElement,
        this.textareaRef.nativeElement,
        () => {
          const s = this.ctrl.getState()
          this.menuPos = s.menuPos
          this.resolvedMenuItems = s.menuItems
          this.cdr.detectChanges()
        },
        this.contentRef.nativeElement,
      )
    })
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.ctrl) return
    if (changes['value']) {
      this.ngZone.runOutsideAngular(() => this.ctrl.setValue(changes['value'].currentValue))
    }
    if (changes['language'] || changes['fontSize'] || changes['fontFamily'] || changes['tabSize']) {
      this.ngZone.runOutsideAngular(() => {
        this.ctrl.updateOptions({
          language: this.language,
          fontSize: this.fontSize,
          fontFamily: this.fontFamily,
          tabSize: this.tabSize,
        })
      })
    }
  }

  ngOnDestroy(): void {
    this.ctrl?.destroy()
  }

  onContainerClick(event: MouseEvent): void {
    if (event.target === this.containerRef.nativeElement) {
      this.textareaRef.nativeElement.focus({ preventScroll: true } as any)
    }
  }

  onContextMenuItemClick(item: ContextMenuItem): void {
    if (!item.disabled) {
      item.onClick()
      this.ctrl.closeMenu()
    }
  }
}
