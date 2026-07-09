import { tokenize } from '../core/tokenizer'
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
  PADDING_LEFT,
  PADDING_TOP,
  FONT_SIZE_TO_LINE_HEIGHT,
  DEFAULT_FONT_SIZE,
  DEFAULT_FONT_FAMILY,
  DEFAULT_TAB_SIZE,
  colFromX,
} from '../core/renderer'

// ---- Types ----

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

/** Props shape shared across React, Vue, and Angular wrappers. */
export interface PretextEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  binding?: IEditorBinding
  active?: boolean
  contextMenuItems?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
}

export interface EditorControllerOptions {
  value: string
  onChange: (value: string) => void
  language?: string
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  binding?: IEditorBinding
  active?: boolean
  contextMenuItems?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
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

const globalTokenCache = new Map<string, TokenizedLine[]>()

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
  menuPos: { x: number; y: number } | null = null
  menuItems: ContextMenuItem[] = []

  // Options
  onChange: (value: string) => void
  language: string | undefined
  fontSize: number
  fontFamily: string
  tabSize: number
  binding: IEditorBinding | undefined
  active: boolean
  contextMenuItemsFn: ((builtins: ContextMenuBuiltins) => ContextMenuItem[]) | undefined

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
  private isEditorActive = false
  private cursorVisible = true
  private blinkTimer: ReturnType<typeof setInterval> | null = null
  private lastClick = { time: 0, count: 0 }
  private lastExternalValue: string
  private tokenLinesPatch: TokenizedLine[] | null = null
  private resizeObserver: ResizeObserver | null = null
  private tokenizeTimer: ReturnType<typeof setTimeout> | null = null

  // DOM refs
  private container: HTMLDivElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private textarea: HTMLTextAreaElement | null = null

  // Callback
  private onStateChange: (() => void) | null = null

  constructor(options: EditorControllerOptions) {
    this.doc = fromString(options.value)
    this.onChange = options.onChange
    this.language = options.language
    this.fontSize = options.fontSize ?? DEFAULT_FONT_SIZE
    this.fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY
    this.tabSize = options.tabSize ?? DEFAULT_TAB_SIZE
    this.binding = options.binding
    this.active = options.active ?? false
    this.contextMenuItemsFn = options.contextMenuItems
    this.lastExternalValue = options.value
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
  ): void {
    this.container = container
    this.canvas = canvas
    this.textarea = textarea
    this.onStateChange = onStateChange

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
      this.repaint()
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
      }
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
      this.scheduleTokenize()
    }

    // Initial repaint
    requestAnimationFrame(() => this.repaint())
  }

  destroy(): void {
    if (this.blinkTimer) { clearInterval(this.blinkTimer); this.blinkTimer = null }
    if (this.tokenizeTimer) { clearTimeout(this.tokenizeTimer); this.tokenizeTimer = null }
    this.resizeObserver?.disconnect()
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas?.removeEventListener('pointermove', this.onPointerMove)
    this.canvas?.removeEventListener('pointerup', this.onPointerUp)
    this.canvas?.removeEventListener('contextmenu', this.onContextMenu as EventListener)
    this.textarea?.removeEventListener('beforeinput', this.onBeforeInput as EventListener)
    this.textarea?.removeEventListener('blur', this.onBlur)
    this.container?.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('pointerdown', this.onGlobalPointerDown, { capture: true })
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
      this.notifyAndRepaint()
    }
  }

  updateOptions(options: Partial<EditorControllerOptions>): void {
    const langChanged = options.language !== undefined && options.language !== this.language
    if (options.language !== undefined) this.language = options.language
    if (options.fontSize !== undefined) this.fontSize = options.fontSize
    if (options.fontFamily !== undefined) this.fontFamily = options.fontFamily
    if (options.tabSize !== undefined) this.tabSize = options.tabSize
    if (options.binding !== undefined) this.binding = options.binding
    if (options.active !== undefined) {
      this.active = options.active
      if (this.active && this.binding && this.container) {
        this.container.scrollTop = PADDING_TOP + this.binding.getSourceLine() * this.lineHeight
      }
    }
    if (options.contextMenuItems !== undefined) this.contextMenuItemsFn = options.contextMenuItems
    if (langChanged) this.scheduleTokenize()
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

    this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.doc = fromString(newText)
    this.selAnchor = null
    this.extraCursors = []
    this.lastExternalValue = newText
    this.onChange(newText)
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
    this.buildMenuItems()
    this.onStateChange?.()
    this.repaint()
  }

  // ---- Internal: Commit update with undo ----

  private commitUpdate(newDoc: Doc, newAnchor: Cursor | null, newExtra: CursorSlot[] = []): void {
    this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
    if (this.undoStack.length > 200) this.undoStack.shift()
    this.redoStack = []
    this.doc = newDoc
    this.selAnchor = newAnchor
    this.extraCursors = newExtra
    const str = toString(newDoc)
    this.lastExternalValue = str
    this.onChange(str)
    if (this.language) this.scheduleTokenize()
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

    const sel = this.selAnchor ? { anchor: this.selAnchor, head: this.doc.cursor } : null
    const tokenLinesToRender = this.tokenLinesPatch ?? this.tokenLines
    this.tokenLinesPatch = null

    renderCanvas({
      canvas,
      lines: this.doc.lines,
      cursor: this.doc.cursor,
      selection: sel,
      extraCursors: this.extraCursors,
      scrollTop: container.scrollTop,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      tabSize: this.tabSize,
      tokenLines: tokenLinesToRender,
      cursorVisible: this.cursorVisible,
      searchHighlights: this.searchState.isOpen ? this.searchMatches : undefined,
      searchCurrentIdx: this.searchState.currentIndex,
    })
  }

  // ---- Internal: Cursor from pointer ----

  private cursorFromPointer = (e: PointerEvent): Cursor => {
    const canvas = this.canvas!
    const container = this.container!
    const ctx = canvas.getContext('2d')!
    const rect = canvas.getBoundingClientRect()
    const cssX = e.clientX - rect.left
    const cssY = e.clientY - rect.top + container.scrollTop
    const line = Math.max(
      0,
      Math.min(this.doc.lines.length - 1, Math.floor((cssY - PADDING_TOP) / this.lineHeight)),
    )
    const textX = cssX - (PADDING_LEFT + 4)
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

  // ---- Internal: Tokenization ----

  private scheduleTokenize(): void {
    if (this.tokenizeTimer) clearTimeout(this.tokenizeTimer)
    // Debounce tokenization to avoid excessive calls during rapid typing
    this.tokenizeTimer = setTimeout(() => {
      if (!this.language) return
      const text = toString(this.doc)
      const key = `${this.language}::${text}`
      const cached = globalTokenCache.get(key)
      if (cached) {
        this.tokenLines = cached
        this.notifyAndRepaint()
        return
      }
      tokenize(text, this.language).then(tokens => {
        globalTokenCache.set(key, tokens)
        this.tokenLines = tokens
        this.notifyAndRepaint()
      }).catch(() => {})
    }, 0)
  }

  // ---- Internal: Auto-scroll cursor into view ----

  private scrollCursorIntoView(): void {
    const container = this.container
    if (!container || container.clientHeight === 0) return
    const cursorY = PADDING_TOP + this.doc.cursor.line * this.lineHeight
    if (cursorY < container.scrollTop) {
      container.scrollTop = cursorY
    } else if (cursorY + this.lineHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = cursorY + this.lineHeight - container.clientHeight + PADDING_TOP
    }
  }

  // ---- Event handlers ----

  private onScroll = (): void => {
    this.repaint()
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
      this.extraCursors = []
      this.dragAnchor = newCursor
      this.selAnchor = null
      this.doc = { ...this.doc, cursor: newCursor }
    }

    this.notifyAndRepaint()
    e.stopPropagation()
    ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!(e.buttons & 1)) return
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
    this.notifyAndRepaint()
  }

  private onPointerUp = (): void => {
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
  }

  onCompositionEnd = (e: CompositionEvent): void => {
    this.isComposing = false
    if (this.textarea) this.textarea.value = ''
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

    if (ctrl) {
      switch (e.key.toLowerCase()) {
        case 'a': {
          e.preventDefault()
          const lastLine = this.doc.lines.length - 1
          this.selAnchor = { line: 0, col: 0 }
          this.doc = { ...this.doc, cursor: { line: lastLine, col: this.doc.lines[lastLine].length } }
          this.notifyAndRepaint()
          this.scrollCursorIntoView()
          return
        }
        case 'c': {
          e.preventDefault()
          const sel = this.getActiveSel()
          if (sel && !isCollapsed(sel)) {
            navigator.clipboard.writeText(getSelectedText(this.doc.lines, sel)).catch(() => {})
          }
          return
        }
        case 'x': {
          e.preventDefault()
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
        case 'v': {
          e.preventDefault()
          navigator.clipboard.readText().then((text) => {
            if (!text) return
            const sel = this.getActiveSel()
            const base = sel && !isCollapsed(sel) ? deleteSelectedText(this.doc, sel) : this.doc
            this.commitUpdate(insert(base, text), null)
            requestAnimationFrame(() => this.scrollCursorIntoView())
          }).catch(() => {})
          return
        }
        case 'z': {
          e.preventDefault()
          if (shift) {
            const next = this.redoStack.pop()
            if (next) {
              this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
              this.doc = next.doc
              this.selAnchor = next.selAnchor
              this.extraCursors = next.extraCursors
              const str = toString(next.doc)
              this.lastExternalValue = str
              this.onChange(str)
              this.notifyAndRepaint()
              this.scrollCursorIntoView()
              if (this.searchState.isOpen) this.scheduleSearch()
            }
          } else {
            const prev = this.undoStack.pop()
            if (prev) {
              this.redoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
              this.doc = prev.doc
              this.selAnchor = prev.selAnchor
              this.extraCursors = prev.extraCursors
              const str = toString(prev.doc)
              this.lastExternalValue = str
              this.onChange(str)
              this.notifyAndRepaint()
              this.scrollCursorIntoView()
              if (this.searchState.isOpen) this.scheduleSearch()
            }
          }
          return
        }
        case 'y': {
          e.preventDefault()
          const next = this.redoStack.pop()
          if (next) {
            this.undoStack.push({ doc: this.doc, selAnchor: this.selAnchor, extraCursors: this.extraCursors })
            this.doc = next.doc
            this.selAnchor = next.selAnchor
            this.extraCursors = next.extraCursors
            const str = toString(next.doc)
            this.lastExternalValue = str
            this.onChange(str)
            this.notifyAndRepaint()
            this.scrollCursorIntoView()
            if (this.searchState.isOpen) this.scheduleSearch()
          }
          return
        }
        case 'f': {
          e.preventDefault()
          this.openSearch()
          return
        }
        case 'l': {
          e.preventDefault()
          if (shift) {
            // Ctrl+Shift+L: select all occurrences
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
          const [newDoc, newAnchor] = selectCurrentLine(this.doc)
          this.selAnchor = newAnchor
          this.doc = newDoc
          this.notifyAndRepaint()
          return
        }
        case 'd': {
          e.preventDefault()
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
          const alreadySelected = allHeads.some(h => toOffset(this.doc.lines, h) === foundEndOff)
          if (alreadySelected) return
          this.extraCursors = [...this.extraCursors, { head: found.head, anchor: found.anchor }]
          this.notifyAndRepaint()
          return
        }
        case 'k': {
          if (!shift) return
          e.preventDefault()
          this.commitUpdate(deleteLine(this.doc, this.getActiveSel()), null)
          return
        }
        case 'enter': {
          e.preventDefault()
          this.commitUpdate(shift ? insertLineAbove(this.doc) : insertLineBelow(this.doc), null)
          return
        }
        case 'backspace': {
          e.preventDefault()
          this.applyToAllCursors((d, sel) =>
            sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteWordBackward(d),
          )
          return
        }
        case 'delete': {
          e.preventDefault()
          this.applyToAllCursors((d, sel) =>
            sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteWordForward(d),
          )
          return
        }
        case '/': {
          e.preventDefault()
          const commentStr = LINE_COMMENT[this.language ?? ''] ?? ''
          if (!commentStr) return
          const [newDoc, newAnchor] = toggleLineComment(this.doc, this.getActiveSel(), commentStr)
          this.commitUpdate(newDoc, newAnchor)
          return
        }
      }
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
        break
      }
      case 'Delete': {
        e.preventDefault()
        this.applyToAllCursors((d, sel) =>
          sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteForward(d),
        )
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
