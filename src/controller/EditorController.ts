import { WorkerTokenizer, firstChangedLine, computeLineDelta, type TokenBatchCallback } from '../core/tokenizer'
import type { TokenizedLine } from '../core/renderer'
import { buildSearchRegex, buildLineOffsets, fastOffsetToCursor, applyPreserveCase, INITIAL_SEARCH_STATE, type SearchState, type SearchMatch } from '../core/search'
import {
  fromString,
  toString,
  insert,
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  moveCursor,
  moveToLineStart,
  moveToLineEnd,
  moveToFileStart,
  moveToFileEnd,
  moveWordLeft,
  moveWordRight,
  deleteLine,
  moveLines,
  copyLines,
  insertLineBelow,
  insertLineAbove,
  selectCurrentLine,
  selectWordAtCursor,
  toggleLineComment,
  findNextOccurrence,
  findAllOccurrences,
  deleteSelectedText,
  getSelectedText,
  isCollapsed,
  normalizeSelection,
  type Cursor,
  type Doc,
  type Selection,
} from '../core/document'
import {
  renderCanvas,
  measureWithTabs,
  computeVisualLayout,
  PADDING_LEFT,
  PADDING_TOP,
  FONT_SIZE_TO_LINE_HEIGHT,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TAB_SIZE,
  colFromX,
  type VisualLayout,
} from '../core/renderer'
import { log } from '../core/logger'

// ---- Types ----

export type KeyChord = string[]
export type KeyBinding = KeyChord | KeyChord[] | null
export type CommandId =
  | 'selectAll' | 'copy' | 'cut' | 'paste'
  | 'undo' | 'redo'
  | 'find'
  | 'selectLine' | 'selectAllOccurrences' | 'selectNextOccurrence'
  | 'deleteLine' | 'insertLineBelow' | 'insertLineAbove'
  | 'deleteWordBackward' | 'deleteWordForward'
  | 'toggleLineComment'

export const DEFAULT_KEYMAP: Record<CommandId, KeyChord[]> = {
  selectAll:            [['ctrl', 'a']],
  copy:                 [['ctrl', 'c']],
  cut:                  [['ctrl', 'x']],
  paste:                [['ctrl', 'v']],
  undo:                 [['ctrl', 'z']],
  redo:                 [['ctrl', 'shift', 'z'], ['ctrl', 'y']],
  find:                 [['ctrl', 'f']],
  selectLine:           [['ctrl', 'l']],
  selectAllOccurrences: [['ctrl', 'shift', 'l']],
  selectNextOccurrence: [['ctrl', 'd']],
  deleteLine:           [['ctrl', 'shift', 'k']],
  insertLineBelow:      [['ctrl', 'enter']],
  insertLineAbove:      [['ctrl', 'shift', 'enter']],
  deleteWordBackward:   [['ctrl', 'backspace']],
  deleteWordForward:    [['ctrl', 'delete']],
  toggleLineComment:    [['ctrl', '/']],
}

export interface ContextMenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  separator?: boolean
}

export interface ContextMenuBuiltins {
  copy: ContextMenuItem
  cut: ContextMenuItem
  paste: ContextMenuItem
  selectAll: ContextMenuItem
}

export interface IEditorBinding {
  reportSourceLine(line: number): void
  getSourceLine(): number
}

export type OnChangedCallback = (r1: number, c1: number, r2: number, c2: number, oldValue: string, newValue: string) => void

/** Props shape shared across React, Vue, and Angular wrappers. */
export interface PretextEditorProps {
  value: string
  onChanged?: OnChangedCallback
  keymap?: Partial<Record<CommandId, KeyBinding>>
  language?: string
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  binding?: IEditorBinding
  active?: boolean
  contextMenuItems?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
  wordWrap?: boolean
}

export interface EditorControllerOptions {
  value: string
  onChanged?: OnChangedCallback
  keymap?: Partial<Record<CommandId, KeyBinding>>
  language?: string
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  binding?: IEditorBinding
  active?: boolean
  contextMenuItems?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
  worker?: Worker
  workerUrl?: URL | string
  theme?: string
  wordWrap?: boolean
}

export interface EditorControllerState {
  doc: Doc
  selAnchor: Cursor | null
  extraCursors: CursorSlot[]
  tokenLines: TokenizedLine[] | undefined
  menuPos: { x: number; y: number } | null
  menuItems: ContextMenuItem[]
  searchState: SearchState
}

export type { SearchState, SearchMatch } from '../core/search'
export type { SearchActions } from '../core/search'

export type PretextEditorHandle = {
  getTopLine(): number
  scrollToLine(line: number): void
  getVisibleLines(): { from: number; to: number }
}

export type CursorSlot = { head: Cursor; anchor: Cursor | null }

type Snapshot = { doc: Doc; selAnchor: Cursor | null; extraCursors: CursorSlot[] }

// ---- Helpers ----

const LINE_COMMENT: Record<string, string> = {
  typescript: '//', tsx: '//', javascript: '//', jsx: '//',
  python: '#', ruby: '#', bash: '#', sh: '#',
  go: '//', rust: '//', c: '//', cpp: '//', csharp: '//',
  java: '//', kotlin: '//', swift: '//', dart: '//', scala: '//',
  lua: '--', sql: '--', r: '#', toml: '#', yaml: '#', makefile: '#',
}

function toOffset(lines: string[], cursor: Cursor): number {
  let off = 0
  for (let i = 0; i < cursor.line; i++) off += lines[i].length + 1
  return off + cursor.col
}

function fromOffset(lines: string[], offset: number): Cursor {
  let o = Math.max(0, offset)
  for (let i = 0; i < lines.length; i++) {
    if (o <= lines[i].length) return { line: i, col: o }
    o -= lines[i].length + 1
  }
  const last = lines.length - 1
  return { line: last, col: lines[last].length }
}

function findEditBounds(before: string, after: string): { start: number; delLen: number; insLen: number } {
  let s = 0
  while (s < before.length && s < after.length && before[s] === after[s]) s++
  let eb = before.length
  let ea = after.length
  while (eb > s && ea > s && before[eb - 1] === after[ea - 1]) { eb--; ea-- }
  return { start: s, delLen: eb - s, insLen: ea - s }
}

// ---- Controller ----

export class EditorController {
  // Public state (read by framework wrappers via getState())
  doc: Doc
  selAnchor: Cursor | null = null
  extraCursors: CursorSlot[] = []
  tokenLines: TokenizedLine[] | undefined = undefined
  private tokenizer = new WorkerTokenizer()
  menuPos: { x: number; y: number } | null = null
  menuItems: ContextMenuItem[] = []

  // Options
  onChanged: OnChangedCallback | undefined
  private resolvedKeymap: Record<CommandId, KeyChord[] | null>
  language: string | undefined
  fontSize: number
  fontFamily: string
  tabSize: number
  binding: IEditorBinding | undefined
  active: boolean
  contextMenuItemsFn: ((builtins: ContextMenuBuiltins) => ContextMenuItem[]) | undefined
  private theme = 'dark-plus'

  // Search state (public so React wrapper can read via getState())
  searchState: SearchState = { ...INITIAL_SEARCH_STATE }
  private searchMatches: SearchMatch[] = []
  private searchGeneration = 0

  // Internal state
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private isComposing = false
  private dragAnchor: Cursor | null = null
  private columnDrag: { anchorLine: number; anchorCol: number } | null = null
  private autoScrollVelocity = 0
  private autoScrollVelocityX = 0
  private autoScrollRaf: number | null = null
  private lastDragEvent: PointerEvent | null = null
  private isEditorActive = false
  private cursorVisible = true
  private blinkTimer: ReturnType<typeof setInterval> | null = null
  private lastClick = { time: 0, count: 0 }
  private lastExternalValue: string
  private tokenLinesPatch: TokenizedLine[] | null = null
  private resizeObserver: ResizeObserver | null = null
  private tokenEpoch = 0
  private workerReady = false
  private gutterWidth = PADDING_LEFT
  private lastRenderOptions: import('../core/renderer').RenderOptions | null = null
  private contentEl: HTMLElement | null = null
  private charWidth = 0
  private contentWidthDirty = true
  private dirtyLines: Set<number> | null = null
  private wordWrap = false
  private visualLayout: VisualLayout | null = null
  private layoutDirty = false

  // DOM refs
  private container: HTMLDivElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private textarea: HTMLTextAreaElement | null = null

  // Callback
  private onStateChange: (() => void) | null = null

  constructor(options: EditorControllerOptions) {
    this.doc = fromString(options.value)
    this.onChanged = options.onChanged
    this.resolvedKeymap = this.buildResolvedKeymap(options.keymap)
    this.language = options.language
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
    this.fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY
    this.tabSize = options.tabSize ?? DEFAULT_TAB_SIZE
    this.binding = options.binding
    this.active = options.active ?? false
    this.contextMenuItemsFn = options.contextMenuItems
    this.lastExternalValue = options.value
    this.theme = options.theme ?? 'dark-plus'
    this.wordWrap = options.wordWrap ?? false
    this.tokenizer.init(options.worker ?? options.workerUrl)
    if (this.theme !== 'dark-plus') this.tokenizer.setTheme(this.theme)
  }

  get lineHeight(): number {
    return FONT_SIZE_TO_LINE_HEIGHT(this.fontSize)
  }

  // ---- Lifecycle ----

  mount(
    container: HTMLDivElement,
    canvas: HTMLCanvasElement,
    textarea: HTMLTextAreaElement,
    onStateChange: () => void,
    contentEl: HTMLElement,
  ): void {
    this.container = container
    this.canvas = canvas
    this.textarea = textarea
    this.onStateChange = onStateChange
    this.contentEl = contentEl

    // Bind event handlers
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('contextmenu', this.onContextMenu as EventListener)

    textarea.addEventListener('beforeinput', this.onBeforeInput as EventListener)
    textarea.addEventListener('blur', this.onBlur)

    container.addEventListener('scroll', this.onScroll)

    window.addEventListener('pointerdown', this.onGlobalPointerDown, { capture: true })

    // Cursor blink
    this.cursorVisible = true
    this.blinkTimer = setInterval(() => {
      this.cursorVisible = !this.cursorVisible
      this.repaintCursorLine()
    }, 530)

    // Auto-focus
    requestAnimationFrame(() => {
      this.isEditorActive = true
      this.textarea?.focus({ preventScroll: true })
    })

    // ResizeObserver
    this.resizeObserver = new ResizeObserver(() => {
      if (this.canvas && this.container) {
        this.canvas.style.height = this.container.clientHeight + 'px'
        this.canvas.style.width = this.container.clientWidth + 'px'
      }
      this.layoutDirty = true
      this.contentWidthDirty = true
      this.repaint()
    })
    this.resizeObserver.observe(container)

    // Active binding scroll
    if (this.active && this.binding) {
      requestAnimationFrame(() => {
        if (this.container && this.binding) {
          this.container.scrollTop = PADDING_TOP + this.binding.getSourceLine() * this.lineHeight
        }
      })
    }

    // Tokenization
    if (this.language) {
      this.tokenizer.setLang(this.language, () => {
        this.workerReady = true
        this.triggerFullTokenize()
      })
    }

    // Apply theme attribute for CSS light/dark overrides
    this.applyThemeAttribute()

    // Initial repaint
    requestAnimationFrame(() => this.repaint())
  }

  private buildResolvedKeymap(override?: Partial<Record<CommandId, KeyBinding>>): Record<CommandId, KeyChord[] | null> {
    const result = { ...DEFAULT_KEYMAP } as Record<CommandId, KeyChord[] | null>
    if (!override) return result
    for (const [id, binding] of Object.entries(override) as [CommandId, KeyBinding][]) {
      result[id] = this.normalizeBinding(binding)
    }
    return result
  }

  private normalizeBinding(b: KeyBinding): KeyChord[] | null {
    if (b === null) return null
    if (b.length === 0) return []
    return typeof b[0] === 'string' ? [b as KeyChord] : b as KeyChord[]
  }

  private matchesChord(e: KeyboardEvent, chord: KeyChord): boolean {
    const MODS = ['ctrl', 'shift', 'alt', 'meta']
    const lower = chord.map(s => s.toLowerCase())
    const needsCtrl = lower.includes('ctrl')
    const needsShift = lower.includes('shift')
    const needsAlt = lower.includes('alt')
    const key = lower.find(s => !MODS.includes(s))
    if (!key) return false
    if (needsCtrl !== (e.ctrlKey || e.metaKey)) return false
    if (needsShift !== e.shiftKey) return false
    if (needsAlt !== e.altKey) return false
    return e.key.toLowerCase() === key
  }

  private findCommand(e: KeyboardEvent): CommandId | null {
    for (const [id, chords] of Object.entries(this.resolvedKeymap) as [CommandId, KeyChord[] | null][]) {
      if (!chords) continue
      for (const chord of chords) {
        if (this.matchesChord(e, chord)) return id
      }
    }
    return null
  }

  private execCommand(id: CommandId): void {
    switch (id) {
      case 'selectAll': {
        const lastLine = this.doc.lines.length - 1
        this.selAnchor = { line: 0, col: 0 }
        this.doc = { ...this.doc, cursor: { line: lastLine, col: this.doc.lines[lastLine].length } }
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        return
      }
      case 'copy': {
        const sel = this.getActiveSel()
        if (sel && !isCollapsed(sel)) {
          navigator.clipboard.writeText(getSelectedText(this.doc.lines, sel)).catch(() => {})
        }
        return
      }
      case 'cut': {
        const sel = this.getActiveSel()
        if (sel && !isCollapsed(sel)) {
          navigator.clipboard.writeText(getSelectedText(this.doc.lines, sel)).catch(() => {})
          this.commitUpdate(deleteSelectedText(this.doc, sel), null)
        } else {
          const { cursor, lines } = this.doc
          const lineText = lines[cursor.line] + (lines.length > 1 ? '\n' : '')
          navigator.clipboard.writeText(lineText).catch(() => {})
          this.commitUpdate(deleteLine(this.doc, null), null)
        }
        return
      }
      case 'paste': {
        navigator.clipboard.readText().then((text) => {
          if (!text) return
          const sel = this.getActiveSel()
          const base = sel && !isCollapsed(sel) ? deleteSelectedText(this.doc, sel) : this.doc
          this.commitUpdate(insert(base, text), null)
          log('[paste]', text.length, 'chars')
          requestAnimationFrame(() => this.scrollCursorIntoView())
        }).catch(() => {})
        return
      }
      case 'undo': {
        const prev = this.undoStack.pop()
        if (prev) {
          const oldLines = this.doc.lines
          this.redoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
          this.doc = prev.doc
          this.selAnchor = prev.selAnchor
          this.extraCursors = prev.extraCursors
          this.lastExternalValue = toString(prev.doc)
          this.notifyChanged(oldLines)
          this.notifyAndRepaint()
          this.scrollCursorIntoView()
          if (this.searchState.isOpen) this.scheduleSearch()
        }
        return
      }
      case 'redo': {
        const next = this.redoStack.pop()
        if (next) {
          const oldLines = this.doc.lines
          this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
          this.doc = next.doc
          this.selAnchor = next.selAnchor
          this.extraCursors = next.extraCursors
          this.lastExternalValue = toString(next.doc)
          this.notifyChanged(oldLines)
          this.notifyAndRepaint()
          this.scrollCursorIntoView()
          if (this.searchState.isOpen) this.scheduleSearch()
        }
        return
      }
      case 'find': {
        this.openSearch()
        return
      }
      case 'selectLine': {
        const [newDoc, newAnchor] = selectCurrentLine(this.doc)
        this.selAnchor = newAnchor
        this.doc = newDoc
        this.notifyAndRepaint()
        return
      }
      case 'selectAllOccurrences': {
        const currentAnchor = this.selAnchor
        let searchText: string
        if (currentAnchor) {
          searchText = getSelectedText(this.doc.lines, { anchor: currentAnchor, head: this.doc.cursor })
        } else {
          const result = selectWordAtCursor(this.doc)
          if (!result) return
          const [wDoc, wAnchor] = result
          searchText = getSelectedText(wDoc.lines, { anchor: wAnchor, head: wDoc.cursor })
        }
        if (!searchText) return
        const occurrences = findAllOccurrences(this.doc.lines, searchText)
        if (occurrences.length === 0) return
        const [first, ...rest] = occurrences
        this.doc = { ...this.doc, cursor: first.head }
        this.selAnchor = first.anchor
        this.extraCursors = rest.map(o => ({ head: o.head, anchor: o.anchor }))
        this.notifyAndRepaint()
        return
      }
      case 'selectNextOccurrence': {
        const currentAnchor = this.selAnchor
        if (!currentAnchor) {
          const result = selectWordAtCursor(this.doc)
          if (!result) return
          const [newDoc, newAnchor] = result
          this.selAnchor = newAnchor
          this.doc = newDoc
          this.notifyAndRepaint()
          return
        }
        const searchText = getSelectedText(this.doc.lines, { anchor: currentAnchor, head: this.doc.cursor })
        if (!searchText) return
        const allHeads = [this.doc.cursor, ...this.extraCursors.map(s => s.head)]
        const lastEnd = Math.max(...allHeads.map(h => toOffset(this.doc.lines, h)))
        const found = findNextOccurrence(this.doc.lines, searchText, lastEnd)
        if (!found) return
        const foundEndOff = toOffset(this.doc.lines, found.head)
        if (allHeads.some(h => toOffset(this.doc.lines, h) === foundEndOff)) return
        this.extraCursors = [...this.extraCursors, { head: found.head, anchor: found.anchor }]
        this.notifyAndRepaint()
        return
      }
      case 'deleteLine': {
        this.commitUpdate(deleteLine(this.doc, this.getActiveSel()), null)
        log('[delete] line')
        return
      }
      case 'insertLineBelow': {
        this.commitUpdate(insertLineBelow(this.doc), null)
        return
      }
      case 'insertLineAbove': {
        this.commitUpdate(insertLineAbove(this.doc), null)
        return
      }
      case 'deleteWordBackward': {
        this.applyToAllCursors((d, sel) =>
          sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteWordBackward(d),
        )
        log('[delete] word-backward')
        return
      }
      case 'deleteWordForward': {
        this.applyToAllCursors((d, sel) =>
          sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteWordForward(d),
        )
        log('[delete] word-forward')
        return
      }
      case 'toggleLineComment': {
        const commentStr = LINE_COMMENT[this.language ?? ''] ?? ''
        if (!commentStr) return
        const [newDoc, newAnchor] = toggleLineComment(this.doc, this.getActiveSel(), commentStr)
        this.commitUpdate(newDoc, newAnchor)
        return
      }
    }
  }

  private notifyChanged(oldLines: string[]): void {
    if (!this.onChanged) return
    const newLines = this.doc.lines
    const oldStr = oldLines.join('\n')
    const newStr = newLines.join('\n')
    let start = 0
    const minLen = Math.min(oldStr.length, newStr.length)
    while (start < minLen && oldStr[start] === newStr[start]) start++
    let oldEnd = oldStr.length
    let newEnd = newStr.length
    while (oldEnd > start && newEnd > start && oldStr[oldEnd - 1] === newStr[newEnd - 1]) { oldEnd--; newEnd-- }
    const [r1, c1] = this.posOf(oldLines, start)
    const [r2, c2] = this.posOf(oldLines, oldEnd)
    this.onChanged(r1, c1, r2, c2, oldStr.slice(start, oldEnd), newStr.slice(start, newEnd))
  }

  private posOf(lines: string[], offset: number): [number, number] {
    let rem = offset
    for (let i = 0; i < lines.length; i++) {
      if (rem <= lines[i].length) return [i, rem]
      rem -= lines[i].length + 1
    }
    return [lines.length - 1, lines[lines.length - 1]?.length ?? 0]
  }

  private applyThemeAttribute(): void {
    const root = this.container?.parentElement
    if (root) root.dataset.theme = this.theme.includes('light') ? 'light' : 'dark'
  }

  private resetCursorBlink(): void {
    this.cursorVisible = true
    if (this.blinkTimer) clearInterval(this.blinkTimer)
    this.blinkTimer = setInterval(() => {
      this.cursorVisible = !this.cursorVisible
      this.repaintCursorLine()
    }, 530)
  }

  destroy(): void {
    if (this.blinkTimer) { clearInterval(this.blinkTimer); this.blinkTimer = null }
    this.stopAutoScroll()
    this.resizeObserver?.disconnect()
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas?.removeEventListener('pointermove', this.onPointerMove)
    this.canvas?.removeEventListener('pointerup', this.onPointerUp)
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu as EventListener)
    this.textarea?.removeEventListener('beforeinput', this.onBeforeInput as EventListener)
    this.textarea?.removeEventListener('blur', this.onBlur)
    this.container?.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('pointerdown', this.onGlobalPointerDown, { capture: true })
    this.tokenizer.destroy()
    this.container = null
    this.canvas = null
    this.textarea = null
    this.onStateChange = null
  }

  // ---- External API ----

  setValue(value: string): void {
    if (value !== this.lastExternalValue && value !== toString(this.doc)) {
      this.lastExternalValue = value
      this.doc = fromString(value)
      this.selAnchor = null
      this.extraCursors = []
      this.contentWidthDirty = true
      this.layoutDirty = true
      this.notifyAndRepaint()
    }
  }

  updateOptions(options: Partial<EditorControllerOptions>): void {
    const langChanged = options.language !== undefined && options.language !== this.language
    if (options.language !== undefined) this.language = options.language
    if (options.fontSize !== undefined) { this.fontSize = options.fontSize; this.charWidth = 0; this.contentWidthDirty = true; this.layoutDirty = true }
    if (options.fontFamily !== undefined) { this.fontFamily = options.fontFamily; this.charWidth = 0; this.contentWidthDirty = true; this.layoutDirty = true }
    if (options.tabSize !== undefined) { this.tabSize = options.tabSize; this.contentWidthDirty = true; this.layoutDirty = true }
    if (options.wordWrap !== undefined && options.wordWrap !== this.wordWrap) {
      this.wordWrap = options.wordWrap
      this.layoutDirty = true
      this.contentWidthDirty = true
      if (!this.wordWrap && this.container) this.container.scrollLeft = 0
    }
    if (options.keymap !== undefined) this.resolvedKeymap = this.buildResolvedKeymap(options.keymap)
    if (options.binding !== undefined) this.binding = options.binding
    if (options.active !== undefined) {
      this.active = options.active
      if (this.active && this.binding && this.container) {
        this.container.scrollTop = PADDING_TOP + this.binding.getSourceLine() * this.lineHeight
      }
    }
    if (options.contextMenuItems !== undefined) this.contextMenuItemsFn = options.contextMenuItems
    let workerWillRepaint = false
    if (options.theme !== undefined && options.theme !== this.theme) {
      this.theme = options.theme
      this.applyThemeAttribute()
      this.tokenizer.setTheme(this.theme)
      if (this.workerReady) {
        this.triggerFullTokenize(true)
        workerWillRepaint = true
      }
    }
    if (langChanged && this.language) {
      this.workerReady = false
      this.tokenizer.setLang(this.language, () => {
        this.workerReady = true
        this.triggerFullTokenize(true)
      })
    }
    if (!workerWillRepaint) this.repaint()
  }

  getState(): EditorControllerState {
    return {
      doc: this.doc,
      selAnchor: this.selAnchor,
      extraCursors: this.extraCursors,
      tokenLines: this.tokenLines,
      menuPos: this.menuPos,
      menuItems: this.menuItems,
      searchState: this.searchState,
    }
  }

  // ---- Search ----

  openSearch(query?: string): void {
    const sel = this.selAnchor && !isCollapsed({ anchor: this.selAnchor, head: this.doc.cursor })
      ? getSelectedText(this.doc.lines, { anchor: this.selAnchor, head: this.doc.cursor })
      : null
    const q = query ?? sel ?? this.searchState.query
    this.searchState = { ...this.searchState, isOpen: true, query: q, focusToken: this.searchState.focusToken + 1 }
    this.scheduleSearch()
  }

  closeSearch(): void {
    this.searchGeneration++  // cancel in-progress async search
    this.searchState = { ...this.searchState, isOpen: false }
    this.searchMatches = []
    this.notifyAndRepaint()
    requestAnimationFrame(() => this.textarea?.focus({ preventScroll: true }))
  }

  setSearchQuery(q: string): void {
    this.searchState = { ...this.searchState, query: q }
    this.scheduleSearch()
  }

  searchNext(): void {
    if (this.searchMatches.length === 0) return
    const next = (this.searchState.currentIndex + 1) % this.searchMatches.length
    this.searchState = { ...this.searchState, currentIndex: next }
    this.selectAndScrollToMatch(next)
    this.notifyAndRepaint()
  }

  searchPrev(): void {
    if (this.searchMatches.length === 0) return
    const prev = (this.searchState.currentIndex - 1 + this.searchMatches.length) % this.searchMatches.length
    this.searchState = { ...this.searchState, currentIndex: prev }
    this.selectAndScrollToMatch(prev)
    this.notifyAndRepaint()
  }

  setSearchCaseSensitive(v: boolean): void {
    this.searchState = { ...this.searchState, caseSensitive: v }
    this.scheduleSearch()
  }

  setSearchWholeWord(v: boolean): void {
    this.searchState = { ...this.searchState, wholeWord: v }
    this.scheduleSearch()
  }

  setSearchUseRegex(v: boolean): void {
    this.searchState = { ...this.searchState, useRegex: v }
    this.scheduleSearch()
  }

  toggleReplace(): void {
    this.searchState = { ...this.searchState, showReplace: !this.searchState.showReplace }
    this.notifyAndRepaint()
  }

  setReplaceQuery(q: string): void {
    this.searchState = { ...this.searchState, replaceQuery: q }
    this.notifyAndRepaint()
  }

  setPreserveCase(v: boolean): void {
    this.searchState = { ...this.searchState, preserveCase: v }
    this.notifyAndRepaint()
  }

  replace(): void {
    const idx = this.searchState.currentIndex
    const match = this.searchMatches[idx]
    if (!match || this.searchState.regexError) return
    const { query, replaceQuery, caseSensitive, wholeWord, useRegex, preserveCase } = this.searchState

    const matchedText = getSelectedText(this.doc.lines, { anchor: match.anchor, head: match.head })
    let replacement: string
    if (useRegex) {
      try {
        const flags = caseSensitive ? '' : 'i'
        const src = wholeWord ? `(?<![\\w])(?:${query})(?![\\w])` : query
        const re = new RegExp(src, flags)
        replacement = matchedText.replace(re, replaceQuery)
      } catch { return }
    } else {
      replacement = preserveCase ? applyPreserveCase(matchedText, replaceQuery) : replaceQuery
    }

    const sel = { anchor: match.anchor, head: match.head }
    const afterDelete = deleteSelectedText(this.doc, sel)
    this.commitUpdate(insert(afterDelete, replacement), null)
    this.scheduleSearch()
  }

  replaceAll(): void {
    const { query, replaceQuery, caseSensitive, wholeWord, useRegex, regexError, preserveCase } = this.searchState
    if (!query || this.searchMatches.length === 0 || regexError) return

    const { pattern } = buildSearchRegex(query, caseSensitive, wholeWord, useRegex)
    if (!pattern) return

    const oldText = toString(this.doc)
    const newText = useRegex || !preserveCase
      ? oldText.replace(pattern, replaceQuery)
      : oldText.replace(pattern, (matched) => applyPreserveCase(matched, replaceQuery))
    if (newText === oldText) return

    const oldLines = this.doc.lines
    this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.doc = fromString(newText)
    this.selAnchor = null
    this.extraCursors = []
    this.lastExternalValue = newText
    this.notifyChanged(oldLines)
    this.scheduleSearch()
  }

  private scheduleSearch(): void {
    const generation = ++this.searchGeneration
    // Immediately clear stale results so UI doesn't show outdated count
    this.searchMatches = []
    this.searchState = { ...this.searchState, matchCount: 0, currentIndex: -1, regexError: null }
    this.notifyAndRepaint()
    void this.runSearchAsync(generation)
  }

  private async runSearchAsync(generation: number): Promise<void> {
    const { query, caseSensitive, wholeWord, useRegex } = this.searchState
    if (!query) return

    const { pattern, regexError } = buildSearchRegex(query, caseSensitive, wholeWord, useRegex)
    if (regexError) {
      if (generation === this.searchGeneration) {
        this.searchState = { ...this.searchState, regexError }
        this.notifyAndRepaint()
      }
      return
    }
    if (!pattern) return

    const lines = this.doc.lines
    const text = lines.join('\n')
    const lineOffsets = buildLineOffsets(lines)
    const matches: SearchMatch[] = []
    const BATCH = 1000

    while (true) {
      const m = pattern.exec(text)
      if (!m) break
      if (m[0].length === 0) { pattern.lastIndex++; continue }
      matches.push({
        anchor: fastOffsetToCursor(lineOffsets, lines, m.index),
        head: fastOffsetToCursor(lineOffsets, lines, m.index + m[0].length),
      })

      if (matches.length % BATCH === 0) {
        // Show partial results, then yield to the event loop
        if (generation !== this.searchGeneration) return
        this.searchMatches = matches.slice()
        this.searchState = { ...this.searchState, matchCount: matches.length, currentIndex: -1, regexError: null }
        this.notifyAndRepaint()
        await new Promise<void>(r => setTimeout(r, 0))
        if (generation !== this.searchGeneration) return
      }
    }

    if (generation !== this.searchGeneration) return

    // Final: pin currentIndex and scroll to first match
    this.searchMatches = matches
    const count = matches.length
    const prev = this.searchState.currentIndex
    const clamped = count === 0 ? -1 : prev >= 0 ? Math.min(prev, count - 1) : 0
    this.searchState = { ...this.searchState, matchCount: count, currentIndex: clamped, regexError: null }
    if (clamped >= 0) this.selectAndScrollToMatch(clamped)
    this.notifyAndRepaint()
  }

  private selectAndScrollToMatch(idx: number): void {
    const match = this.searchMatches[idx]
    if (!match) return
    this.doc = { ...this.doc, cursor: match.head }
    this.selAnchor = match.anchor
    const container = this.container
    if (container) {
      const lh = this.lineHeight
      const lineTop = PADDING_TOP + match.anchor.line * lh
      if (lineTop < container.scrollTop) container.scrollTop = lineTop - lh
      else if (lineTop + lh > container.scrollTop + container.clientHeight) container.scrollTop = lineTop - lh
    }
  }

  getHandle(): PretextEditorHandle {
    const self = this
    return {
      getTopLine(): number {
        if (!self.container) return 0
        return Math.max(0, Math.floor((self.container.scrollTop - PADDING_TOP) / self.lineHeight))
      },
      scrollToLine(line: number): void {
        if (self.container) self.container.scrollTop = PADDING_TOP + line * self.lineHeight
      },
      getVisibleLines(): { from: number; to: number } {
        if (!self.container) return { from: 0, to: 0 }
        const from = Math.max(0, Math.floor((self.container.scrollTop - PADDING_TOP) / self.lineHeight))
        const to = Math.floor((self.container.scrollTop + self.container.clientHeight - PADDING_TOP) / self.lineHeight)
        return { from, to }
      },
    }
  }

  // ---- Context menu actions ----

  executeCopy(): void {
    const sel = this.getActiveSel()
    if (sel && !isCollapsed(sel)) {
      navigator.clipboard.writeText(getSelectedText(this.doc.lines, sel)).catch(() => {})
    }
  }

  executeCut(): void {
    const sel = this.getActiveSel()
    if (sel && !isCollapsed(sel)) {
      navigator.clipboard.writeText(getSelectedText(this.doc.lines, sel)).catch(() => {})
      this.commitUpdate(deleteSelectedText(this.doc, sel), null)
    } else {
      const { cursor, lines } = this.doc
      const lineText = lines[cursor.line] + (lines.length > 1 ? '\n' : '')
      navigator.clipboard.writeText(lineText).catch(() => {})
      this.commitUpdate(deleteLine(this.doc, null), null)
    }
  }

  executePaste(): void {
    navigator.clipboard.readText().then(text => {
      if (!text) return
      const sel = this.getActiveSel()
      const base = sel && !isCollapsed(sel) ? deleteSelectedText(this.doc, sel) : this.doc
      this.commitUpdate(insert(base, text), null)
      log('[paste]', text.length, 'chars')
      requestAnimationFrame(() => this.scrollCursorIntoView())
    }).catch(() => {})
  }

  executeSelectAll(): void {
    const lastLine = this.doc.lines.length - 1
    this.selAnchor = { line: 0, col: 0 }
    this.doc = { ...this.doc, cursor: { line: lastLine, col: this.doc.lines[lastLine].length } }
    this.notifyAndRepaint()
  }

  closeMenu(): void {
    this.menuPos = null
    this.notifyAndRepaint()
  }

  // ---- Internal: State notification ----

  private notifyAndRepaint(): void {
    this.resetCursorBlink()
    this.buildMenuItems()
    this.onStateChange?.()
    this.repaint()
  }

  // ---- Internal: Commit update with undo ----

  private commitUpdate(newDoc: Doc, newAnchor: Cursor | null, newExtra: CursorSlot[] = []): void {
    const oldLines = this.doc.lines
    this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
    if (this.undoStack.length > 200) this.undoStack.shift()

    let workerWillRepaint = false
    if (this.language && this.workerReady) {
      const newLines = newDoc.lines
      const fromLine = firstChangedLine(oldLines, newLines)
      const { removedCount, addedLines } = computeLineDelta(oldLines, newLines, fromLine)
      const epoch = ++this.tokenEpoch

      if (!this.tokenLines) {
        this.tokenLines = new Array(newLines.length).fill([])
      } else if (removedCount !== addedLines.length) {
        // Line count changed (Enter / cross-line Backspace): must resize the array.
        // For same-line-count edits keep the stale spans — they look correct until
        // the worker responds, avoiding a white flash on the first repaint.
        this.tokenLines.splice(fromLine, removedCount, ...new Array(addedLines.length).fill([]))
      }

      const visFrom = this.visibleLineStart()
      const visEnd = this.visibleLineEnd(newLines.length)
      log(`[layout] commitUpdate fromLine=${fromLine} cursorLine=${newDoc.cursor.line} visibleEnd=${visEnd} totalLines=${newLines.length}`)
      const cb: TokenBatchCallback = (from, to, tl) => {
        if (this.tokenEpoch !== epoch) return
        log(`[hl recv] from=${from} to=${to}`)
        for (let i = 0; i < tl.length; i++) this.tokenLines![from + i] = tl[i]
        if (this.batchOverlapsViewport(from, to)) this.notifyAndRepaint()
      }
      this.tokenizer.update(fromLine, removedCount, addedLines, cb, visFrom, visEnd)
      // If the new cursor lands outside the current viewport (e.g. paste jumps to end),
      // tell the worker immediately so Phase 2 rushes there without waiting for onScroll.
      const newCursorLine = newDoc.cursor.line
      if (newCursorLine > visEnd || newCursorLine < visFrom) {
        const linesPerPage = visEnd - visFrom
        const newVisTo = Math.min(newLines.length, newCursorLine + 1)
        const newVisFrom = Math.max(0, newVisTo - linesPerPage)
        this.tokenizer.notifyViewport(newVisFrom, newVisTo)
      }
      workerWillRepaint = fromLine < newLines.length
    }

    this.doc = newDoc
    this.selAnchor = newAnchor
    this.extraCursors = newExtra
    this.contentWidthDirty = true
    this.layoutDirty = true
    const str = toString(newDoc)
    this.lastExternalValue = str
    this.notifyChanged(oldLines)
    if (!workerWillRepaint) this.notifyAndRepaint()
  }

  // ---- Internal: Worker-backed tokenization ----

  private visibleLineStart(): number {
    if (!this.container) return 0
    return Math.max(0, Math.floor((this.container.scrollTop - PADDING_TOP) / this.lineHeight))
  }

  private visibleLineEnd(lineCount = this.doc.lines.length): number {
    if (!this.container) return 0
    const scrollTop = this.container.scrollTop
    const h = this.container.clientHeight
    return Math.min(lineCount, Math.ceil((scrollTop + h - PADDING_TOP) / this.lineHeight) + 1)
  }

  private batchOverlapsViewport(from: number, to: number): boolean {
    if (!this.container) return true
    const scrollTop = this.container.scrollTop
    const h = this.container.clientHeight
    const visFirst = Math.floor((scrollTop - PADDING_TOP) / this.lineHeight)
    const visLast = Math.ceil((scrollTop + h - PADDING_TOP) / this.lineHeight)
    if (to > visFirst && from <= visLast) return true
    // Also repaint if the cursor is in this batch; scrollCursorIntoView will bring it into view.
    const cursorLine = this.doc.cursor.line
    return cursorLine >= from && cursorLine < to
  }

  private triggerFullTokenize(keepTokens = false): void {
    const lines = this.doc.lines
    const epoch = ++this.tokenEpoch
    const visFrom = this.visibleLineStart()
    const visEnd = this.visibleLineEnd()
    if (!keepTokens || !this.tokenLines) this.tokenLines = new Array(lines.length).fill([])
    this.tokenizer.update(0, 0, lines, (from, to, tl) => {
      if (this.tokenEpoch !== epoch) return
      for (let i = 0; i < tl.length; i++) this.tokenLines![from + i] = tl[i]
      if (this.batchOverlapsViewport(from, to)) this.repaint()
    }, visFrom, visEnd)
  }

  async readFromFile(file: File): Promise<void> {
    const text = await file.text()
    const allLines = text.split('\n')
    const epoch = ++this.tokenEpoch

    const oldLines = this.doc.lines
    this.selAnchor = null
    this.extraCursors = []
    this.tokenLines = undefined
    if (this.container) this.container.scrollTop = 0

    // Progressive content rendering: [200, 400, 800, 1600, rest]
    const BATCHES = [200, 400, 800, 1600]
    let shown = 0
    for (let bi = 0; shown < allLines.length; bi++) {
      const size = BATCHES[Math.min(bi, BATCHES.length - 1)]
      shown = Math.min(shown + size, allLines.length)
      this.doc = { lines: allLines.slice(0, shown), cursor: { line: 0, col: 0 } }
      this.repaint()
      if (shown < allLines.length) {
        await new Promise<void>(r => requestAnimationFrame(() => r()))
        if (this.tokenEpoch !== epoch) return
      }
    }

    this.doc = { lines: allLines, cursor: { line: 0, col: 0 } }
    this.lastExternalValue = text
    this.notifyChanged(oldLines)

    if (this.language && this.workerReady) {
      this.tokenLines = new Array(allLines.length).fill([])
      this.tokenizer.update(0, 0, allLines, (from, to, tl) => {
        if (this.tokenEpoch !== epoch) return
        for (let i = 0; i < tl.length; i++) this.tokenLines![from + i] = tl[i]
        if (this.batchOverlapsViewport(from, to)) this.repaint()
      }, this.visibleLineStart(), this.visibleLineEnd())
    }

    this.contentWidthDirty = true
    this.layoutDirty = true
    this.notifyAndRepaint()
  }

  // ---- Internal: Active selection ----

  private getActiveSel(): Selection | null {
    return this.selAnchor ? { anchor: this.selAnchor, head: this.doc.cursor } : null
  }

  // ---- Internal: Multi-cursor editing ----

  private applyToAllCursors(op: (d: Doc, sel: Selection | null) => Doc): void {
    const extra = this.extraCursors
    if (extra.length === 0) {
      const sel = this.getActiveSel()
      this.commitUpdate(op(this.doc, sel), null)
      return
    }

    const allSlots: CursorSlot[] = [
      { head: this.doc.cursor, anchor: this.selAnchor },
      ...extra,
    ]
    let currentDoc = this.doc
    const offsets = allSlots.map(s => ({
      head: toOffset(currentDoc.lines, s.head),
      anchor: s.anchor !== null ? toOffset(currentDoc.lines, s.anchor) : null,
    }))
    const order = offsets.map((_, i) => i).sort((a, b) => offsets[a].head - offsets[b].head)
    const result = offsets.map(o => ({ ...o }))

    for (const idx of order) {
      const cur = result[idx]
      const head = fromOffset(currentDoc.lines, cur.head)
      const anchor = cur.anchor !== null ? fromOffset(currentDoc.lines, cur.anchor) : null
      const sel = anchor ? { anchor, head } : null

      const textBefore = toString(currentDoc)
      const newDoc = op({ ...currentDoc, cursor: head }, sel)
      const textAfter = toString(newDoc)
      const { start, delLen, insLen } = findEditBounds(textBefore, textAfter)
      const delta = insLen - delLen

      result[idx] = { head: toOffset(newDoc.lines, newDoc.cursor), anchor: null }

      for (let j = 0; j < result.length; j++) {
        if (j === idx) continue
        const adj = (o: number) =>
          o <= start ? o : o < start + delLen ? start + insLen : o + delta
        const prevAnchor = result[j].anchor
        result[j] = {
          head: adj(result[j].head),
          anchor: prevAnchor !== null ? adj(prevAnchor) : null,
        }
      }
      currentDoc = newDoc
    }

    const slots = result.map(o => ({
      head: fromOffset(currentDoc.lines, o.head),
      anchor: o.anchor !== null ? fromOffset(currentDoc.lines, o.anchor) : null,
    }))

    const seen = new Set<string>()
    seen.add(`${slots[0].head.line}:${slots[0].head.col}`)
    const newExtra = slots.slice(1).filter(s => {
      const k = `${s.head.line}:${s.head.col}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })

    this.commitUpdate({ ...currentDoc, cursor: slots[0].head }, slots[0].anchor, newExtra)
  }

  // ---- Internal: Column selection ----

  private buildColumnSelection(anchorLine: number, anchorCol: number, headLine: number, headCol: number): void {
    const { lines } = this.doc
    const topLine = Math.min(anchorLine, headLine)
    const botLine = Math.max(anchorLine, headLine)
    const slots: CursorSlot[] = []
    for (let line = topLine; line <= botLine; line++) {
      const maxCol = lines[line]?.length ?? 0
      slots.push({
        head: { line, col: Math.min(headCol, maxCol) },
        anchor: { line, col: Math.min(anchorCol, maxCol) },
      })
    }
    const primaryIdx = anchorLine - topLine
    const primary = slots[primaryIdx]
    this.doc = { ...this.doc, cursor: primary.head }
    this.selAnchor = primary.anchor
    this.extraCursors = slots.filter((_, i) => i !== primaryIdx)
    this.notifyAndRepaint()
  }

  // ---- Internal: Canvas repaint ----

  private computeLayout(): void {
    if (!this.wordWrap || !this.canvas || !this.container) { this.visualLayout = null; return }
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.font = `${this.fontSize}px ${this.fontFamily}`
    const availableWidth = this.container.clientWidth - this.gutterWidth
    if (availableWidth <= 0) return
    this.visualLayout = computeVisualLayout(ctx, this.doc.lines, availableWidth, this.tabSize)
  }

  private updateContentHeight(): void {
    if (!this.contentEl) return
    const totalRows = this.visualLayout ? this.visualLayout.rows.length : this.doc.lines.length
    const h = Math.max(1, totalRows) * this.lineHeight + PADDING_TOP * 2
    this.contentEl.style.height = h + 'px'
  }

  private updateContentWidth(): void {
    if (!this.contentEl || !this.container || !this.canvas) return
    if (this.charWidth === 0) {
      const ctx = this.canvas.getContext('2d')
      if (!ctx) return
      ctx.font = `${this.fontSize}px ${this.fontFamily}`
      this.charWidth = ctx.measureText('m').width
    }
    const cw = this.charWidth
    const tw = cw * this.tabSize
    let maxW = 0
    for (const line of this.doc.lines) {
      let w = 0
      for (let i = 0; i < line.length; i++) {
        w += line[i] === '\t' ? tw : cw
      }
      if (w > maxW) maxW = w
    }
    const minW = this.container.clientWidth
    this.contentEl.style.width = Math.max(this.gutterWidth + maxW + 20, minW) + 'px'
  }

  private repaint = (): void => {
    const canvas = this.canvas
    const container = this.container
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w
      canvas.height = h
    }

    if (this.layoutDirty) {
      this.computeLayout()
      this.layoutDirty = false
    }
    this.updateContentHeight()
    if (!this.wordWrap && this.contentWidthDirty) {
      this.updateContentWidth()
      this.contentWidthDirty = false
    } else if (this.wordWrap && this.contentEl && this.container) {
      this.contentEl.style.width = this.container.clientWidth + 'px'
    }

    const sel = this.selAnchor ? { anchor: this.selAnchor, head: this.doc.cursor } : null
    log(`[repaint] selAnchor=${JSON.stringify(this.selAnchor)} cursor=${JSON.stringify(this.doc.cursor)} sel=${JSON.stringify(sel)}`)
    const tokenLinesToRender = this.tokenLinesPatch ?? this.tokenLines
    this.tokenLinesPatch = null

    const opts: import('../core/renderer').RenderOptions = {
      canvas,
      lines: this.doc.lines,
      cursor: this.doc.cursor,
      selection: sel,
      extraCursors: this.extraCursors,
      scrollTop: container.scrollTop,
      scrollLeft: this.wordWrap ? 0 : container.scrollLeft,
      visualLayout: this.visualLayout ?? undefined,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      tabSize: this.tabSize,
      tokenLines: tokenLinesToRender,
      cursorVisible: this.cursorVisible,
      searchHighlights: this.searchState.isOpen ? this.searchMatches : undefined,
      searchCurrentIdx: this.searchState.currentIndex,
      theme: this.theme,
      dirtyLines: this.dirtyLines ?? undefined,
    }
    this.dirtyLines = null
    this.lastRenderOptions = opts
    this.gutterWidth = renderCanvas(opts).gutterWidth
  }

  private repaintCursorLine(): void {
    const canvas = this.canvas
    const container = this.container
    const opts = this.lastRenderOptions
    if (!canvas || !container || !opts) return
    const cursorLine = this.doc.cursor.line
    const lineHeight = this.lineHeight
    const firstVR = this.visualLayout
      ? (this.visualLayout.logToFirstVisual[cursorLine] ?? cursorLine)
      : cursorLine
    const y = PADDING_TOP + firstVR * lineHeight - container.scrollTop
    const h = canvas.height / (window.devicePixelRatio || 1)
    if (y + lineHeight < 0 || y > h) return
    renderCanvas({ ...opts, cursorVisible: this.cursorVisible, singleLine: cursorLine })
  }

  // ---- Internal: Cursor from pointer ----

  private cursorFromPointer = (e: PointerEvent): Cursor => {
    const canvas = this.canvas!
    const container = this.container!
    const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const cssY = e.clientY - rect.top + container.scrollTop
    if (this.visualLayout) {
      const vr = Math.max(0, Math.min(
        this.visualLayout.rows.length - 1,
        Math.floor((cssY - PADDING_TOP) / this.lineHeight),
      ))
      const { logLine, startCol, endCol } = this.visualLayout.rows[vr]
      const textX = e.clientX - rect.left - this.gutterWidth
      const lineText = this.doc.lines[logLine] ?? ''
      const colInChunk = textX <= 0
        ? 0
        : colFromX(ctx, lineText.slice(startCol, endCol), textX, this.fontSize, this.fontFamily, this.tabSize)
      return { line: logLine, col: startCol + colInChunk }
    }
    const cssX = e.clientX - rect.left + container.scrollLeft
    const line = Math.max(
      0,
      Math.min(this.doc.lines.length - 1, Math.floor((cssY - PADDING_TOP) / this.lineHeight)),
    )
    const textX = cssX - this.gutterWidth
    const col =
      textX <= 0 ? 0 : colFromX(ctx, this.doc.lines[line] ?? '', textX, this.fontSize, this.fontFamily, this.tabSize)
    return { line, col }
  }

  // ---- Internal: Menu items ----

  private buildMenuItems(): void {
    const hasSel = this.selAnchor !== null && !isCollapsed({ anchor: this.selAnchor, head: this.doc.cursor })
    const builtins: ContextMenuBuiltins = {
      copy:      { label: '复制', onClick: () => this.executeCopy(),      disabled: !hasSel },
      cut:       { label: '剪切', onClick: () => this.executeCut(),       disabled: !hasSel },
      paste:     { label: '粘贴', onClick: () => this.executePaste(),     disabled: false },
      selectAll: { label: '全选', onClick: () => this.executeSelectAll(), disabled: false },
    }
    this.menuItems = this.contextMenuItemsFn
      ? this.contextMenuItemsFn(builtins)
      : [builtins.copy, builtins.cut, builtins.paste, { label: '', onClick: () => {}, separator: true }, builtins.selectAll]
  }

  // ---- Internal: Auto-scroll cursor into view ----

  private scrollCursorIntoView(): void {
    this.updateContentHeight()
    const container = this.container
    if (!container || container.clientHeight === 0) return
    const lh = this.lineHeight

    if (this.visualLayout) {
      // Find visual row of cursor
      const { logToFirstVisual, rows } = this.visualLayout
      const cursor = this.doc.cursor
      const firstVR = logToFirstVisual[cursor.line] ?? cursor.line
      let vr = firstVR
      for (let r = firstVR; r < rows.length && rows[r].logLine === cursor.line; r++) {
        if (cursor.col >= rows[r].startCol && cursor.col <= rows[r].endCol) { vr = r; break }
      }
      const cursorY = PADDING_TOP + vr * lh
      if (cursorY < container.scrollTop) container.scrollTop = cursorY
      else if (cursorY + lh > container.scrollTop + container.clientHeight) container.scrollTop = cursorY + lh - container.clientHeight + PADDING_TOP
      return
    }

    const cursorY = PADDING_TOP + this.doc.cursor.line * lh
    if (cursorY < container.scrollTop) {
      container.scrollTop = cursorY
    } else if (cursorY + lh > container.scrollTop + container.clientHeight) {
      container.scrollTop = cursorY + lh - container.clientHeight + PADDING_TOP
    }
    // Horizontal: scroll cursor x into view
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d')
      if (ctx) {
        ctx.font = `${this.fontSize}px ${this.fontFamily}`
        const lineText = this.doc.lines[this.doc.cursor.line] ?? ''
        const cursorTextX = measureWithTabs(ctx, lineText.slice(0, this.doc.cursor.col), this.tabSize)
        const visW = container.clientWidth - this.gutterWidth
        if (cursorTextX < container.scrollLeft) {
          container.scrollLeft = Math.max(0, cursorTextX - 20)
        } else if (cursorTextX > container.scrollLeft + visW - 4) {
          container.scrollLeft = cursorTextX - visW + 4
        }
      }
    }
  }

  // ---- Event handlers ----

  private onScroll = (): void => {
    this.repaint()
    if (this.language && this.workerReady) {
      this.tokenizer.notifyViewport(this.visibleLineStart(), this.visibleLineEnd())
    }
    if (!this.binding || !this.active) return
    if (!this.container) return
    const topLine = Math.max(0, Math.floor((this.container.scrollTop - PADDING_TOP) / this.lineHeight))
    this.binding.reportSourceLine(topLine)
  }

  private onGlobalPointerDown = (e: PointerEvent): void => {
    if (!this.container?.contains(e.target as Node)) {
      this.isEditorActive = false
    }
  }

  // ---- Pointer events ----

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    this.isEditorActive = true
    this.textarea?.focus({ preventScroll: true })

    // Alt+Shift+Click: column selection
    if (e.altKey && e.shiftKey) {
      const clickPos = this.cursorFromPointer(e)
      const anchorLine = this.doc.cursor.line
      const anchorCol = this.doc.cursor.col
      this.columnDrag = { anchorLine, anchorCol }
      this.buildColumnSelection(anchorLine, anchorCol, clickPos.line, clickPos.col)
      e.stopPropagation()
      ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
      return
    }

    // Alt+Click: toggle extra cursor
    if (e.altKey && !e.shiftKey) {
      const newCursor = this.cursorFromPointer(e)
      const idx = this.extraCursors.findIndex(s => s.head.line === newCursor.line && s.head.col === newCursor.col)
      if (idx >= 0) {
        this.extraCursors = this.extraCursors.filter((_, i) => i !== idx)
      } else {
        this.extraCursors = [...this.extraCursors, { head: newCursor, anchor: null }]
      }
      this.notifyAndRepaint()
      e.stopPropagation()
      ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
      return
    }

    const newCursor = this.cursorFromPointer(e)

    const now = Date.now()
    const elapsed = now - this.lastClick.time
    const count = elapsed < 400 ? this.lastClick.count + 1 : 1
    this.lastClick = { time: now, count }

    if (e.shiftKey) {
      this.extraCursors = []
      this.selAnchor = this.selAnchor ?? this.doc.cursor
      this.doc = { ...this.doc, cursor: newCursor }
    } else if (count >= 4) {
      this.extraCursors = []
      const lastLine = this.doc.lines.length - 1
      this.selAnchor = { line: 0, col: 0 }
      this.doc = { ...this.doc, cursor: { line: lastLine, col: this.doc.lines[lastLine].length } }
    } else if (count === 3) {
      this.extraCursors = []
      const [newDoc, newAnchor] = selectCurrentLine({ ...this.doc, cursor: newCursor })
      this.selAnchor = newAnchor
      this.doc = newDoc
    } else if (count === 2) {
      this.extraCursors = []
      const result = selectWordAtCursor({ ...this.doc, cursor: newCursor })
      if (result) {
        const [newDoc, newAnchor] = result
        this.selAnchor = newAnchor
        this.doc = newDoc
      } else {
        this.selAnchor = null
        this.doc = { ...this.doc, cursor: newCursor }
      }
    } else {
      const prevLine = this.doc.cursor.line
      const canDirty = this.selAnchor === null && this.extraCursors.length === 0
      this.extraCursors = []
      this.dragAnchor = newCursor
      this.selAnchor = null
      this.doc = { ...this.doc, cursor: newCursor }
      if (canDirty) this.dirtyLines = new Set([prevLine, newCursor.line])
    }

    this.notifyAndRepaint()
    e.stopPropagation()
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!(e.buttons & 1)) return
    log(`[drag] buttons=${e.buttons} dragAnchor=${JSON.stringify(this.dragAnchor)} columnDrag=${this.columnDrag !== null}`)
    if (this.columnDrag !== null) {
      const pos = this.cursorFromPointer(e)
      const { anchorLine, anchorCol } = this.columnDrag
      this.buildColumnSelection(anchorLine, anchorCol, pos.line, pos.col)
      return
    }
    if (this.dragAnchor === null) return
    const newHead = this.cursorFromPointer(e)
    this.selAnchor = this.dragAnchor
    this.doc = { ...this.doc, cursor: newHead }
    log(`[drag] newHead=${JSON.stringify(newHead)} selAnchor=${JSON.stringify(this.selAnchor)}`)
    this.notifyAndRepaint()
    this.lastDragEvent = e
    this.updateAutoScroll(e)
  }

  private updateAutoScroll(e: PointerEvent): void {
    const rect = this.container!.getBoundingClientRect()
    const ZONE = 20, SPEED_PER_PX = 1.5, MAX_SPEED = 50
    const y = e.clientY
    const x = e.clientX
    const distTop = rect.top + ZONE - y
    const distBottom = y - rect.bottom + ZONE
    if (distTop > 0) this.autoScrollVelocity = -Math.min(distTop * SPEED_PER_PX, MAX_SPEED)
    else if (distBottom > 0) this.autoScrollVelocity = Math.min(distBottom * SPEED_PER_PX, MAX_SPEED)
    else this.autoScrollVelocity = 0
    if (!this.wordWrap) {
      const distLeft = rect.left + ZONE + this.gutterWidth - x
      const distRight = x - rect.right + ZONE
      if (distLeft > 0) this.autoScrollVelocityX = -Math.min(distLeft * SPEED_PER_PX, MAX_SPEED)
      else if (distRight > 0) this.autoScrollVelocityX = Math.min(distRight * SPEED_PER_PX, MAX_SPEED)
      else this.autoScrollVelocityX = 0
    }
    if ((this.autoScrollVelocity !== 0 || this.autoScrollVelocityX !== 0) && this.autoScrollRaf === null)
      this.autoScrollRaf = requestAnimationFrame(this.autoScrollTick)
  }

  private autoScrollTick = (): void => {
    if ((!this.autoScrollVelocity && !this.autoScrollVelocityX) || !this.container || !this.dragAnchor) {
      this.autoScrollRaf = null
      return
    }
    this.container.scrollTop += this.autoScrollVelocity
    this.container.scrollLeft += this.autoScrollVelocityX
    if (this.lastDragEvent) {
      const newHead = this.cursorFromPointer(this.lastDragEvent)
      this.selAnchor = this.dragAnchor
      this.doc = { ...this.doc, cursor: newHead }
      this.notifyAndRepaint()
    }
    this.autoScrollRaf = requestAnimationFrame(this.autoScrollTick)
  }

  private stopAutoScroll(): void {
    this.autoScrollVelocity = 0
    this.autoScrollVelocityX = 0
    if (this.autoScrollRaf !== null) {
      cancelAnimationFrame(this.autoScrollRaf)
      this.autoScrollRaf = null
    }
  }

  private onPointerUp = (): void => {
    this.stopAutoScroll()
    this.lastDragEvent = null
    this.dragAnchor = null
    this.columnDrag = null
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
    this.menuPos = { x: e.clientX, y: e.clientY }
    this.notifyAndRepaint()
  }

  // ---- Textarea events ----

  private onBeforeInput = (e: InputEvent): void => {
    if (this.isComposing || !e.data) return
    e.preventDefault()
    const char = e.data
    const applyToAll = (d: Doc, sel: Selection | null) => {
      const base = sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : d
      return insert(base, char)
    }
    // Use ref-style apply for closure compat
    this.applyToAllCursors(applyToAll)
  }

  private onBlur = (e: FocusEvent): void => {
    if (e.relatedTarget === null && this.isEditorActive) {
      requestAnimationFrame(() => {
        if (this.isEditorActive) this.textarea?.focus({ preventScroll: true })
      })
    }
  }

  // ---- IME ----

  onCompositionStart = (): void => {
    this.isComposing = true
    // Move the hidden textarea to the cursor's document position so the browser's
    // IME scroll-into-view targets the cursor location instead of resetting to top:0.
    if (this.textarea) {
      const vr = this.visualLayout
        ? (this.visualLayout.logToFirstVisual[this.doc.cursor.line] ?? this.doc.cursor.line)
        : this.doc.cursor.line
      this.textarea.style.top = (PADDING_TOP + vr * this.lineHeight) + 'px'
    }
  }

  onCompositionEnd = (e: CompositionEvent): void => {
    this.isComposing = false
    if (this.textarea) {
      this.textarea.style.top = ''
      this.textarea.value = ''
    }
    if (e.data) {
      const text = e.data
      const applyToAll = (d: Doc, sel: Selection | null) => {
        const base = sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : d
        return insert(base, text)
      }
      this.applyToAllCursors(applyToAll)
    }
  }

  // ---- Keyboard ----

  onKeyDown = (e: KeyboardEvent): void => {
    if (this.isComposing) return
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const alt = e.altKey

    const cmdId = this.findCommand(e)
    if (cmdId !== null) {
      e.preventDefault()
      this.execCommand(cmdId)
      return
    }


    // Navigation & editing (non-Ctrl)
    switch (e.key) {
      case 'Escape': {
        if (this.searchState.isOpen) {
          e.preventDefault()
          this.closeSearch()
          return
        }
        if (this.extraCursors.length > 0) {
          e.preventDefault()
          this.extraCursors = []
          this.notifyAndRepaint()
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
        const sel = this.getActiveSel()
        if (!shift && sel && !isCollapsed(sel)) {
          const [start] = normalizeSelection(sel)
          this.selAnchor = null
          this.doc = { ...this.doc, cursor: start }
        } else {
          const newDoc = ctrl ? moveWordLeft(this.doc) : moveCursor(this.doc, 0, -1)
          if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
          else this.selAnchor = null
          this.doc = newDoc
        }
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
        const sel = this.getActiveSel()
        if (!shift && sel && !isCollapsed(sel)) {
          const [, end] = normalizeSelection(sel)
          this.selAnchor = null
          this.doc = { ...this.doc, cursor: end }
        } else {
          const newDoc = ctrl ? moveWordRight(this.doc) : moveCursor(this.doc, 0, 1)
          if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
          else this.selAnchor = null
          this.doc = newDoc
        }
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        if (alt && !ctrl) {
          const sel = this.getActiveSel()
          const [newDoc, newAnchor] = shift
            ? copyLines(this.doc, sel, -1)
            : moveLines(this.doc, sel, -1)
          this.commitUpdate(newDoc, newAnchor)
        } else if (ctrl && alt) {
          const { col } = this.doc.cursor
          const allLines = [this.doc.cursor.line, ...this.extraCursors.map(s => s.head.line)]
          const topLine = Math.min(...allLines)
          if (topLine > 0) {
            const newLine = topLine - 1
            const newCursor = { line: newLine, col: Math.min(col, this.doc.lines[newLine].length) }
            this.extraCursors = [...this.extraCursors, { head: newCursor, anchor: null }]
            this.notifyAndRepaint()
          }
        } else if (!alt) {
          if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
          const newDoc = moveCursor(this.doc, -1, 0)
          if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
          else this.selAnchor = null
          this.doc = newDoc
          this.notifyAndRepaint()
          this.scrollCursorIntoView()
        }
        break
      }
      case 'ArrowDown': {
        e.preventDefault()
        if (alt && !ctrl) {
          const sel = this.getActiveSel()
          const [newDoc, newAnchor] = shift
            ? copyLines(this.doc, sel, 1)
            : moveLines(this.doc, sel, 1)
          this.commitUpdate(newDoc, newAnchor)
        } else if (ctrl && alt) {
          const { col } = this.doc.cursor
          const allLines = [this.doc.cursor.line, ...this.extraCursors.map(s => s.head.line)]
          const botLine = Math.max(...allLines)
          if (botLine < this.doc.lines.length - 1) {
            const newLine = botLine + 1
            const newCursor = { line: newLine, col: Math.min(col, this.doc.lines[newLine].length) }
            this.extraCursors = [...this.extraCursors, { head: newCursor, anchor: null }]
            this.notifyAndRepaint()
          }
        } else if (!alt) {
          if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
          const newDoc = moveCursor(this.doc, 1, 0)
          if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
          else this.selAnchor = null
          this.doc = newDoc
          this.notifyAndRepaint()
          this.scrollCursorIntoView()
        }
        break
      }
      case 'Home': {
        e.preventDefault()
        if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
        const newDoc = ctrl ? moveToFileStart(this.doc) : moveToLineStart(this.doc)
        if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
        else this.selAnchor = null
        this.doc = newDoc
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        break
      }
      case 'End': {
        e.preventDefault()
        if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
        const newDoc = ctrl ? moveToFileEnd(this.doc) : moveToLineEnd(this.doc)
        if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
        else this.selAnchor = null
        this.doc = newDoc
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        break
      }
      case 'PageUp': {
        e.preventDefault()
        if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
        const pageUp = Math.max(1, Math.floor((this.container?.clientHeight ?? 400) / this.lineHeight) - 1)
        const newDoc = moveCursor(this.doc, -pageUp, 0)
        if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
        else this.selAnchor = null
        this.doc = newDoc
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        break
      }
      case 'PageDown': {
        e.preventDefault()
        if (this.extraCursors.length > 0) { this.extraCursors = []; this.notifyAndRepaint() }
        const pageDown = Math.max(1, Math.floor((this.container?.clientHeight ?? 400) / this.lineHeight) - 1)
        const newDoc = moveCursor(this.doc, pageDown, 0)
        if (shift) this.selAnchor = this.selAnchor ?? this.doc.cursor
        else this.selAnchor = null
        this.doc = newDoc
        this.notifyAndRepaint()
        this.scrollCursorIntoView()
        break
      }
      case 'Enter': {
        e.preventDefault()
        this.applyToAllCursors((d, sel) => {
          const base = sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : d
          return insert(base, '\n')
        })
        break
      }
      case 'Backspace': {
        e.preventDefault()
        this.applyToAllCursors((d, sel) =>
          sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteBackward(d),
        )
        log('[delete] backspace')
        break
      }
      case 'Delete': {
        e.preventDefault()
        this.applyToAllCursors((d, sel) =>
          sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteForward(d),
        )
        log('[delete] delete')
        break
      }
      case 'Tab': {
        e.preventDefault()
        const sel = this.getActiveSel()

        if (sel && !isCollapsed(sel)) {
          const [normStart, normEnd] = normalizeSelection(sel)
          if (normStart.line !== normEnd.line) {
            const spaces = ' '.repeat(this.tabSize)
            const newLines = this.doc.lines.slice()
            const removed: number[] = []

            for (let i = normStart.line; i <= normEnd.line; i++) {
              if (shift) {
                const line = newLines[i]
                let n = 0
                while (n < this.tabSize && n < line.length && line[n] === ' ') n++
                newLines[i] = line.slice(n)
                removed.push(n)
              } else {
                newLines[i] = spaces + newLines[i]
                removed.push(0)
              }
            }

            // Patch tokenLines eagerly to avoid stale deferred value
            const tls = this.tokenLines
            if (tls) {
              const newTls = tls.slice()
              for (let i = normStart.line; i <= normEnd.line; i++) {
                const tl = newTls[i]
                if (!tl || tl.length === 0) continue
                if (!shift) {
                  newTls[i] = [{ text: spaces, color: tl[0].color }, ...tl]
                } else {
                  const n = removed[i - normStart.line]
                  if (n === 0) continue
                  let rest = n
                  let spans = tl.slice()
                  while (rest > 0 && spans.length > 0) {
                    if (spans[0].text.length <= rest) {
                      rest -= spans[0].text.length
                      spans = spans.slice(1)
                    } else {
                      spans = [{ text: spans[0].text.slice(rest), color: spans[0].color }, ...spans.slice(1)]
                      rest = 0
                    }
                  }
                  newTls[i] = spans
                }
              }
              this.tokenLinesPatch = newTls
            }

            const adjustCol = (c: Cursor): Cursor => {
              if (c.line < normStart.line || c.line > normEnd.line) return c
              const n = removed[c.line - normStart.line]
              return shift
                ? { line: c.line, col: Math.max(0, c.col - n) }
                : { line: c.line, col: c.col + this.tabSize }
            }

            const newDoc = { ...this.doc, lines: newLines, cursor: adjustCol(sel.head) }
            this.commitUpdate(newDoc, adjustCol(sel.anchor))
            return
          }
        }

        if (shift) return
        this.applyToAllCursors((d, s) => {
          const base = s && !isCollapsed(s) ? deleteSelectedText(d, s) : d
          return insert(base, '  ')
        })
        break
      }
    }
  }
}
