import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { ContextMenu } from './ContextMenu'
import { tokenize } from '../core/tokenizer'

const globalTokenCache = new Map<string, TokenizedLine[]>()
import type { TokenizedLine } from '../core/renderer'
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

/** Structural binding interface — satisfies PretextBinding without importing pretext-markdown. */
export interface IEditorBinding {
  reportSourceLine(line: number): void
  getSourceLine(): number
}

export interface PretextEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  className?: string
  style?: React.CSSProperties
  binding?: IEditorBinding
  /** When true the editor scrolls to the source line stored in binding on activation. */
  active?: boolean
  contextMenuItems?: (builtins: ContextMenuBuiltins) => ContextMenuItem[]
}

export type PretextEditorHandle = {
  getTopLine(): number
  scrollToLine(line: number): void
  getVisibleLines(): { from: number; to: number }
}

export type CursorSlot = { head: Cursor; anchor: Cursor | null }

type Snapshot = { doc: Doc; selAnchor: Cursor | null; extraCursors: CursorSlot[] }

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

const LINE_COMMENT: Record<string, string> = {
  typescript: '//', tsx: '//', javascript: '//', jsx: '//',
  python: '#', ruby: '#', bash: '#', sh: '#',
  go: '//', rust: '//', c: '//', cpp: '//', csharp: '//',
  java: '//', kotlin: '//', swift: '//', dart: '//', scala: '//',
  lua: '--', sql: '--', r: '#', toml: '#', yaml: '#', makefile: '#',
}

export const PretextEditor = forwardRef<PretextEditorHandle, PretextEditorProps>(function PretextEditor({
  value,
  onChange,
  language,
  fontSize = DEFAULT_FONT_SIZE,
  fontFamily = DEFAULT_FONT_FAMILY,
  tabSize = DEFAULT_TAB_SIZE,
  className,
  style,
  binding,
  active,
  contextMenuItems,
}: PretextEditorProps, ref): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef(false)
  const dragAnchorRef = useRef<Cursor | null>(null)
  const columnDragRef = useRef<{ anchorLine: number; anchorCol: number } | null>(null)
  const isEditorActiveRef = useRef(false)
  const cursorBlinkRef = useRef(true)
  const blinkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bindingRef = useRef(binding)
  bindingRef.current = binding
  const activeRef = useRef(active)
  activeRef.current = active

  const [doc, setDoc] = useState<Doc>(() => fromString(value))
  // selAnchor: start of the selection (null = collapsed / no selection)
  const [selAnchor, setSelAnchor] = useState<Cursor | null>(null)
  const [extraCursors, setExtraCursors] = useState<CursorSlot[]>([])

  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])

  // Always-fresh refs so closures aren't stale
  const docRef = useRef(doc)
  const selAnchorRef = useRef(selAnchor)
  const extraCursorsRef = useRef(extraCursors)
  const onChangeRef = useRef(onChange)
  const contextMenuItemsRef = useRef(contextMenuItems)
  docRef.current = doc
  selAnchorRef.current = selAnchor
  extraCursorsRef.current = extraCursors
  onChangeRef.current = onChange
  contextMenuItemsRef.current = contextMenuItems

  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  // Sync external value → doc (only when parent changes it, not our own echoes)
  const lastExternalValue = useRef(value)
  if (value !== lastExternalValue.current && value !== toString(doc)) {
    lastExternalValue.current = value
    setDoc(fromString(value))
    setSelAnchor(null)
  }

  // Syntax highlighting: tokenize with a deferred value so rapid typing doesn't queue many requests
  const deferredValue = useDeferredValue(value)
  const [tokenLines, setTokenLines] = useState<TokenizedLine[] | undefined>(undefined)
  const tokenLinesRef = useRef<TokenizedLine[] | undefined>(undefined)
  tokenLinesRef.current = tokenLines
  // REVIEW: useEffect used because tokenization is an async side effect
  useEffect(() => {
    if (!language) return
    const key = `${language}::${deferredValue}`
    const cached = globalTokenCache.get(key)
    if (cached) { setTokenLines(cached); return }
    let cancelled = false
    tokenize(deferredValue, language).then(tokens => {
      if (cancelled) return
      globalTokenCache.set(key, tokens)
      setTokenLines(tokens)
    })
    return () => { cancelled = true }
  }, [deferredValue, language])

  // REVIEW: useEffect used because active prop change triggers a DOM scroll side effect
  useEffect(() => {
    if (!active || !bindingRef.current) return
    const container = containerRef.current
    if (!container) return
    container.scrollTop = PADDING_TOP + bindingRef.current.getSourceLine() * lineHeightRef.current
  }, [active])
  // One-shot patch injected by structural edits (indent/dedent) to avoid the
  // stale-tokenLines flash caused by useDeferredValue lag.
  const tokenLinesPatchRef = useRef<TokenizedLine[] | null>(null)

  const lineHeight = FONT_SIZE_TO_LINE_HEIGHT(fontSize)
  const lineHeightRef = useRef(lineHeight)
  lineHeightRef.current = lineHeight
  const languageRef = useRef(language)
  languageRef.current = language
  const lastClickRef = useRef({ time: 0, count: 0 })
  const totalHeight = Math.max(1, doc.lines.length) * lineHeight + PADDING_TOP * 2

  // ---- Atomic update (with undo) ----
  const commitUpdate = useCallback(
    (newDoc: Doc, newAnchor: Cursor | null, newExtra: CursorSlot[] = []) => {
      undoStack.current.push({ doc: docRef.current, selAnchor: selAnchorRef.current, extraCursors: extraCursorsRef.current })
      if (undoStack.current.length > 200) undoStack.current.shift()
      redoStack.current = []
      setDoc(newDoc)
      setSelAnchor(newAnchor)
      setExtraCursors(newExtra)
      const str = toString(newDoc)
      lastExternalValue.current = str
      onChangeRef.current(str)
    },
    [],
  )

  // ---- Active selection as a Selection object ----
  const getActiveSel = (): Selection | null =>
    selAnchorRef.current
      ? { anchor: selAnchorRef.current, head: docRef.current.cursor }
      : null

  // ---- Apply op to all cursors simultaneously (multi-cursor editing) ----
  const applyToAllCursors = useCallback(
    (op: (d: Doc, sel: Selection | null) => Doc) => {
      const extra = extraCursorsRef.current
      if (extra.length === 0) {
        const sel = selAnchorRef.current
          ? { anchor: selAnchorRef.current, head: docRef.current.cursor }
          : null
        commitUpdate(op(docRef.current, sel), null)
        return
      }

      const allSlots: CursorSlot[] = [
        { head: docRef.current.cursor, anchor: selAnchorRef.current },
        ...extra,
      ]
      let currentDoc = docRef.current
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

      commitUpdate({ ...currentDoc, cursor: slots[0].head }, slots[0].anchor, newExtra)
    },
    [commitUpdate],
  )
  const applyToAllCursorsRef = useRef(applyToAllCursors)
  applyToAllCursorsRef.current = applyToAllCursors

  // ---- Column (box) selection ----
  const buildColumnSelection = useCallback(
    (anchorLine: number, anchorCol: number, headLine: number, headCol: number) => {
      const { lines } = docRef.current
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
      setDoc(prev => ({ ...prev, cursor: primary.head }))
      setSelAnchor(primary.anchor)
      setExtraCursors(slots.filter((_, i) => i !== primaryIdx))
    },
    [],
  )

  // ---- Canvas repaint ----
  const repaint = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = Math.round(rect.width * dpr)
    const h = Math.round(rect.height * dpr)
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w
      canvas.height = h
    }

    const sel = selAnchorRef.current
      ? { anchor: selAnchorRef.current, head: docRef.current.cursor }
      : null

    const tokenLinesToRender = tokenLinesPatchRef.current ?? tokenLinesRef.current
    tokenLinesPatchRef.current = null

    renderCanvas({
      canvas,
      lines: docRef.current.lines,
      cursor: docRef.current.cursor,
      selection: sel,
      extraCursors: extraCursorsRef.current,
      scrollTop: container.scrollTop,
      fontSize,
      fontFamily,
      tabSize,
      tokenLines: tokenLinesToRender,
      cursorVisible: cursorBlinkRef.current,
    })
  }, [fontSize, fontFamily, tabSize])

  const repaintRef = useRef(repaint)
  repaintRef.current = repaint

  // Repaint after every state change — also reset blink phase so cursor is always visible after interaction
  useLayoutEffect(() => {
    cursorBlinkRef.current = true
    repaint()
  }, [repaint, doc, selAnchor, extraCursors, tokenLines])

  // REVIEW: useEffect used because setInterval is a DOM side-effect that must run after mount
  useEffect(() => {
    blinkTimerRef.current = setInterval(() => {
      cursorBlinkRef.current = !cursorBlinkRef.current
      repaintRef.current()
    }, 530)
    return () => {
      if (blinkTimerRef.current) clearInterval(blinkTimerRef.current)
    }
  }, [])

  // REVIEW: useEffect used because DOM focus must run after mount
  useEffect(() => {
    isEditorActiveRef.current = true
    textareaRef.current?.focus({ preventScroll: true })
  }, [])

  // Auto-scroll cursor into view
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || container.clientHeight === 0) return
    const cursorY = PADDING_TOP + doc.cursor.line * lineHeight
    if (cursorY < container.scrollTop) {
      container.scrollTop = cursorY
    } else if (cursorY + lineHeight > container.scrollTop + container.clientHeight) {
      container.scrollTop = cursorY + lineHeight - container.clientHeight + PADDING_TOP
    }
  }, [doc.cursor, lineHeight])

  // ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      const canvas = canvasRef.current
      if (canvas) canvas.style.height = container.clientHeight + 'px'
      repaint()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [repaint])

  // REVIEW: useEffect used because global DOM listener must be registered after mount
  useEffect(() => {
    const onGlobalPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        isEditorActiveRef.current = false
      }
    }
    window.addEventListener('pointerdown', onGlobalPointerDown, { capture: true })
    return () => window.removeEventListener('pointerdown', onGlobalPointerDown, { capture: true })
  }, [])

  // ---- Pointer → cursor position ----
  const cursorFromPointer = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): Cursor => {
      const canvas = canvasRef.current!
      const container = containerRef.current!
      const ctx = canvas.getContext('2d')!
      const rect = canvas.getBoundingClientRect()
      const cssX = e.clientX - rect.left
      const cssY = e.clientY - rect.top + container.scrollTop
      const line = Math.max(
        0,
        Math.min(docRef.current.lines.length - 1, Math.floor((cssY - PADDING_TOP) / lineHeight)),
      )
      const textX = cssX - (PADDING_LEFT + 4)
      const col =
        textX <= 0 ? 0 : colFromX(ctx, docRef.current.lines[line] ?? '', textX, fontSize, fontFamily, tabSize)
      return { line, col }
    },
    [lineHeight, fontSize, fontFamily, tabSize],
  )

  // ---- Pointer events (click + drag selection) ----
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return
      isEditorActiveRef.current = true
      textareaRef.current?.focus({ preventScroll: true })

      // Alt+Shift+Click: column selection from current cursor to click position
      if (e.altKey && e.shiftKey) {
        const clickPos = cursorFromPointer(e)
        const anchorLine = docRef.current.cursor.line
        const anchorCol = docRef.current.cursor.col
        columnDragRef.current = { anchorLine, anchorCol }
        buildColumnSelection(anchorLine, anchorCol, clickPos.line, clickPos.col)
        e.stopPropagation()
        ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
        return
      }

      // Alt+Click: toggle extra cursor (don't move primary, don't start drag)
      if (e.altKey && !e.shiftKey) {
        const newCursor = cursorFromPointer(e)
        setExtraCursors(prev => {
          const idx = prev.findIndex(s => s.head.line === newCursor.line && s.head.col === newCursor.col)
          return idx >= 0 ? prev.filter((_, i) => i !== idx) : [...prev, { head: newCursor, anchor: null }]
        })
        e.stopPropagation()
        ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
        return
      }

      const newCursor = cursorFromPointer(e)

      const now = Date.now()
      const elapsed = now - lastClickRef.current.time
      const count = elapsed < 400 ? lastClickRef.current.count + 1 : 1
      lastClickRef.current = { time: now, count }

      if (e.shiftKey) {
        setExtraCursors([])
        setSelAnchor((prev) => prev ?? docRef.current.cursor)
        setDoc((prev) => ({ ...prev, cursor: newCursor }))
      } else if (count === 3) {
        setExtraCursors([])
        const [newDoc, newAnchor] = selectCurrentLine({ ...docRef.current, cursor: newCursor })
        setSelAnchor(newAnchor)
        setDoc(newDoc)
      } else if (count === 2) {
        setExtraCursors([])
        const result = selectWordAtCursor({ ...docRef.current, cursor: newCursor })
        if (result) {
          const [newDoc, newAnchor] = result
          setSelAnchor(newAnchor)
          setDoc(newDoc)
        } else {
          setSelAnchor(null)
          setDoc((prev) => ({ ...prev, cursor: newCursor }))
        }
      } else {
        setExtraCursors([])
        dragAnchorRef.current = newCursor
        setSelAnchor(null)
        setDoc((prev) => ({ ...prev, cursor: newCursor }))
      }

      e.stopPropagation()
      ;(e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId)
    },
    [cursorFromPointer, buildColumnSelection],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!(e.buttons & 1)) return
      if (columnDragRef.current !== null) {
        const pos = cursorFromPointer(e)
        const { anchorLine, anchorCol } = columnDragRef.current
        buildColumnSelection(anchorLine, anchorCol, pos.line, pos.col)
        return
      }
      if (dragAnchorRef.current === null) return
      const newHead = cursorFromPointer(e)
      setSelAnchor(dragAnchorRef.current)
      setDoc((prev) => ({ ...prev, cursor: newHead }))
    },
    [cursorFromPointer, buildColumnSelection],
  )

  const handlePointerUp = useCallback(() => {
    dragAnchorRef.current = null
    columnDragRef.current = null
  }, [])

  // ---- Context menu actions ----
  const copyText = useCallback(() => {
    const sel = selAnchorRef.current
      ? { anchor: selAnchorRef.current, head: docRef.current.cursor }
      : null
    if (sel && !isCollapsed(sel)) {
      navigator.clipboard.writeText(getSelectedText(docRef.current.lines, sel)).catch(() => {})
    }
  }, [])

  const cutText = useCallback(() => {
    const sel = selAnchorRef.current
      ? { anchor: selAnchorRef.current, head: docRef.current.cursor }
      : null
    if (sel && !isCollapsed(sel)) {
      navigator.clipboard.writeText(getSelectedText(docRef.current.lines, sel)).catch(() => {})
      commitUpdate(deleteSelectedText(docRef.current, sel), null)
    } else {
      const { cursor, lines } = docRef.current
      const lineText = lines[cursor.line] + (lines.length > 1 ? '\n' : '')
      navigator.clipboard.writeText(lineText).catch(() => {})
      commitUpdate(deleteLine(docRef.current, null), null)
    }
  }, [commitUpdate])

  const pasteText = useCallback(() => {
    navigator.clipboard.readText().then(text => {
      if (!text) return
      const sel = selAnchorRef.current
        ? { anchor: selAnchorRef.current, head: docRef.current.cursor }
        : null
      const base = sel && !isCollapsed(sel) ? deleteSelectedText(docRef.current, sel) : docRef.current
      commitUpdate(insert(base, text), null)
    }).catch(() => {})
  }, [commitUpdate])

  const selectAllText = useCallback(() => {
    const lastLine = docRef.current.lines.length - 1
    setSelAnchor({ line: 0, col: 0 })
    setDoc(prev => ({ ...prev, cursor: { line: lastLine, col: prev.lines[lastLine].length } }))
  }, [])

  const menuItems = useMemo((): ContextMenuItem[] => {
    const hasSel = selAnchor !== null && !isCollapsed({ anchor: selAnchor, head: doc.cursor })
    const builtins: ContextMenuBuiltins = {
      copy:      { label: '复制', onClick: copyText,      disabled: !hasSel },
      cut:       { label: '剪切', onClick: cutText,       disabled: !hasSel },
      paste:     { label: '粘贴', onClick: pasteText,     disabled: false },
      selectAll: { label: '全选', onClick: selectAllText, disabled: false },
    }
    return contextMenuItems
      ? contextMenuItems(builtins)
      : [builtins.copy, builtins.cut, builtins.paste, { label: '', onClick: () => {}, separator: true }, builtins.selectAll]
  }, [selAnchor, doc.cursor, copyText, cutText, pasteText, selectAllText, contextMenuItems])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])

  // ---- Keyboard ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isComposingRef.current) return
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const alt = e.altKey

      if (ctrl) {
        switch (e.key.toLowerCase()) {
          case 'a': {
            e.preventDefault()
            const lastLine = docRef.current.lines.length - 1
            setSelAnchor({ line: 0, col: 0 })
            setDoc((prev) => ({
              ...prev,
              cursor: { line: lastLine, col: prev.lines[lastLine].length },
            }))
            return
          }
          case 'c': {
            e.preventDefault()
            const sel = getActiveSel()
            if (sel && !isCollapsed(sel)) {
              navigator.clipboard.writeText(getSelectedText(docRef.current.lines, sel)).catch(() => {})
            }
            return
          }
          case 'x': {
            e.preventDefault()
            const sel = getActiveSel()
            if (sel && !isCollapsed(sel)) {
              navigator.clipboard.writeText(getSelectedText(docRef.current.lines, sel)).catch(() => {})
              commitUpdate(deleteSelectedText(docRef.current, sel), null)
            } else {
              const { cursor, lines } = docRef.current
              const lineText = lines[cursor.line] + (lines.length > 1 ? '\n' : '')
              navigator.clipboard.writeText(lineText).catch(() => {})
              commitUpdate(deleteLine(docRef.current, null), null)
            }
            return
          }
          case 'v': {
            e.preventDefault()
            navigator.clipboard.readText().then((text) => {
              if (!text) return
              const sel = getActiveSel()
              const base =
                sel && !isCollapsed(sel)
                  ? deleteSelectedText(docRef.current, sel)
                  : docRef.current
              commitUpdate(insert(base, text), null)
            }).catch(() => {})
            return
          }
          case 'z': {
            e.preventDefault()
            if (shift) {
              const next = redoStack.current.pop()
              if (next) {
                undoStack.current.push({ doc: docRef.current, selAnchor: selAnchorRef.current, extraCursors: extraCursorsRef.current })
                setDoc(next.doc)
                setSelAnchor(next.selAnchor)
                setExtraCursors(next.extraCursors)
                const str = toString(next.doc)
                lastExternalValue.current = str
                onChangeRef.current(str)
              }
            } else {
              const prev = undoStack.current.pop()
              if (prev) {
                redoStack.current.push({ doc: docRef.current, selAnchor: selAnchorRef.current, extraCursors: extraCursorsRef.current })
                setDoc(prev.doc)
                setSelAnchor(prev.selAnchor)
                setExtraCursors(prev.extraCursors)
                const str = toString(prev.doc)
                lastExternalValue.current = str
                onChangeRef.current(str)
              }
            }
            return
          }
          case 'y': {
            e.preventDefault()
            const next = redoStack.current.pop()
            if (next) {
              undoStack.current.push({ doc: docRef.current, selAnchor: selAnchorRef.current, extraCursors: extraCursorsRef.current })
              setDoc(next.doc)
              setSelAnchor(next.selAnchor)
              setExtraCursors(next.extraCursors)
              const str = toString(next.doc)
              lastExternalValue.current = str
              onChangeRef.current(str)
            }
            return
          }
          case 'l': {
            e.preventDefault()
            if (shift) {
              // Ctrl+Shift+L: select all occurrences
              const currentDoc = docRef.current
              const currentAnchor = selAnchorRef.current
              let searchText: string
              if (currentAnchor) {
                searchText = getSelectedText(currentDoc.lines, { anchor: currentAnchor, head: currentDoc.cursor })
              } else {
                const result = selectWordAtCursor(currentDoc)
                if (!result) return
                const [wDoc, wAnchor] = result
                searchText = getSelectedText(wDoc.lines, { anchor: wAnchor, head: wDoc.cursor })
              }
              if (!searchText) return
              const occurrences = findAllOccurrences(currentDoc.lines, searchText)
              if (occurrences.length === 0) return
              const [first, ...rest] = occurrences
              setDoc(prev => ({ ...prev, cursor: first.head }))
              setSelAnchor(first.anchor)
              setExtraCursors(rest.map(o => ({ head: o.head, anchor: o.anchor })))
              return
            }
            const [newDoc, newAnchor] = selectCurrentLine(docRef.current)
            setSelAnchor(newAnchor)
            setDoc(newDoc)
            return
          }
          case 'd': {
            e.preventDefault()
            const currentDoc = docRef.current
            const currentAnchor = selAnchorRef.current
            if (!currentAnchor) {
              // First press: select word at cursor
              const result = selectWordAtCursor(currentDoc)
              if (!result) return
              const [newDoc, newAnchor] = result
              setSelAnchor(newAnchor)
              setDoc(newDoc)
              return
            }
            // Subsequent presses: find next occurrence and add as extra cursor
            const searchText = getSelectedText(currentDoc.lines, { anchor: currentAnchor, head: currentDoc.cursor })
            if (!searchText) return
            const allHeads = [currentDoc.cursor, ...extraCursorsRef.current.map(s => s.head)]
            const lastEnd = Math.max(...allHeads.map(h => toOffset(currentDoc.lines, h)))
            const found = findNextOccurrence(currentDoc.lines, searchText, lastEnd)
            if (!found) return
            const foundEndOff = toOffset(currentDoc.lines, found.head)
            const alreadySelected = allHeads.some(h => toOffset(currentDoc.lines, h) === foundEndOff)
            if (alreadySelected) return
            setExtraCursors(prev => [...prev, { head: found.head, anchor: found.anchor }])
            return
          }
          case 'k': {
            if (!shift) return
            e.preventDefault()
            commitUpdate(deleteLine(docRef.current, getActiveSel()), null)
            return
          }
          case 'enter': {
            e.preventDefault()
            commitUpdate(shift ? insertLineAbove(docRef.current) : insertLineBelow(docRef.current), null)
            return
          }
          case 'backspace': {
            e.preventDefault()
            applyToAllCursorsRef.current((d, sel) =>
              sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteWordBackward(d),
            )
            return
          }
          case 'delete': {
            e.preventDefault()
            applyToAllCursorsRef.current((d, sel) =>
              sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteWordForward(d),
            )
            return
          }
          case '/': {
            e.preventDefault()
            const commentStr = LINE_COMMENT[languageRef.current ?? ''] ?? ''
            if (!commentStr) return
            const [newDoc, newAnchor] = toggleLineComment(docRef.current, getActiveSel(), commentStr)
            commitUpdate(newDoc, newAnchor)
            return
          }
        }
      }

      // Navigation & editing
      switch (e.key) {
        case 'Escape': {
          if (extraCursorsRef.current.length > 0) {
            e.preventDefault()
            setExtraCursors([])
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          if (extraCursorsRef.current.length > 0) setExtraCursors([])
          const sel = getActiveSel()
          if (!shift && sel && !isCollapsed(sel)) {
            const [start] = normalizeSelection(sel)
            setSelAnchor(null)
            setDoc((prev) => ({ ...prev, cursor: start }))
          } else {
            const newDoc = ctrl ? moveWordLeft(docRef.current) : moveCursor(docRef.current, 0, -1)
            if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
            else setSelAnchor(null)
            setDoc(newDoc)
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          if (extraCursorsRef.current.length > 0) setExtraCursors([])
          const sel = getActiveSel()
          if (!shift && sel && !isCollapsed(sel)) {
            const [, end] = normalizeSelection(sel)
            setSelAnchor(null)
            setDoc((prev) => ({ ...prev, cursor: end }))
          } else {
            const newDoc = ctrl ? moveWordRight(docRef.current) : moveCursor(docRef.current, 0, 1)
            if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
            else setSelAnchor(null)
            setDoc(newDoc)
          }
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          if (alt && !ctrl) {
            const sel = getActiveSel()
            const [newDoc, newAnchor] = shift
              ? copyLines(docRef.current, sel, -1)
              : moveLines(docRef.current, sel, -1)
            commitUpdate(newDoc, newAnchor)
          } else if (ctrl && alt) {
            // Ctrl+Alt+↑: add cursor above the topmost existing cursor
            const { col } = docRef.current.cursor
            const allLines = [docRef.current.cursor.line, ...extraCursorsRef.current.map(s => s.head.line)]
            const topLine = Math.min(...allLines)
            if (topLine > 0) {
              const newLine = topLine - 1
              const newCursor = { line: newLine, col: Math.min(col, docRef.current.lines[newLine].length) }
              setExtraCursors(prev => [...prev, { head: newCursor, anchor: null }])
            }
          } else if (!alt) {
            if (extraCursorsRef.current.length > 0) setExtraCursors([])
            const newDoc = moveCursor(docRef.current, -1, 0)
            if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
            else setSelAnchor(null)
            setDoc(newDoc)
          }
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          if (alt && !ctrl) {
            const sel = getActiveSel()
            const [newDoc, newAnchor] = shift
              ? copyLines(docRef.current, sel, 1)
              : moveLines(docRef.current, sel, 1)
            commitUpdate(newDoc, newAnchor)
          } else if (ctrl && alt) {
            // Ctrl+Alt+↓: add cursor below the bottommost existing cursor
            const { col } = docRef.current.cursor
            const allLines = [docRef.current.cursor.line, ...extraCursorsRef.current.map(s => s.head.line)]
            const botLine = Math.max(...allLines)
            if (botLine < docRef.current.lines.length - 1) {
              const newLine = botLine + 1
              const newCursor = { line: newLine, col: Math.min(col, docRef.current.lines[newLine].length) }
              setExtraCursors(prev => [...prev, { head: newCursor, anchor: null }])
            }
          } else if (!alt) {
            if (extraCursorsRef.current.length > 0) setExtraCursors([])
            const newDoc = moveCursor(docRef.current, 1, 0)
            if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
            else setSelAnchor(null)
            setDoc(newDoc)
          }
          break
        }
        case 'Home': {
          e.preventDefault()
          if (extraCursorsRef.current.length > 0) setExtraCursors([])
          const newDoc = ctrl ? moveToFileStart(docRef.current) : moveToLineStart(docRef.current)
          if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
          else setSelAnchor(null)
          setDoc(newDoc)
          break
        }
        case 'End': {
          e.preventDefault()
          if (extraCursorsRef.current.length > 0) setExtraCursors([])
          const newDoc = ctrl ? moveToFileEnd(docRef.current) : moveToLineEnd(docRef.current)
          if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
          else setSelAnchor(null)
          setDoc(newDoc)
          break
        }
        case 'PageUp': {
          e.preventDefault()
          if (extraCursorsRef.current.length > 0) setExtraCursors([])
          const pageUp = Math.max(1, Math.floor((containerRef.current?.clientHeight ?? 400) / lineHeightRef.current) - 1)
          const newDoc = moveCursor(docRef.current, -pageUp, 0)
          if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
          else setSelAnchor(null)
          setDoc(newDoc)
          break
        }
        case 'PageDown': {
          e.preventDefault()
          if (extraCursorsRef.current.length > 0) setExtraCursors([])
          const pageDown = Math.max(1, Math.floor((containerRef.current?.clientHeight ?? 400) / lineHeightRef.current) - 1)
          const newDoc = moveCursor(docRef.current, pageDown, 0)
          if (shift) setSelAnchor((prev) => prev ?? docRef.current.cursor)
          else setSelAnchor(null)
          setDoc(newDoc)
          break
        }
        case 'Enter': {
          e.preventDefault()
          applyToAllCursorsRef.current((d, sel) => {
            const base = sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : d
            return insert(base, '\n')
          })
          break
        }
        case 'Backspace': {
          e.preventDefault()
          applyToAllCursorsRef.current((d, sel) =>
            sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteBackward(d),
          )
          break
        }
        case 'Delete': {
          e.preventDefault()
          applyToAllCursorsRef.current((d, sel) =>
            sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : deleteForward(d),
          )
          break
        }
        case 'Tab': {
          e.preventDefault()
          const sel = getActiveSel()
          const currentDoc = docRef.current

          if (sel && !isCollapsed(sel)) {
            const [normStart, normEnd] = normalizeSelection(sel)
            if (normStart.line !== normEnd.line) {
              const spaces = ' '.repeat(tabSize)
              const newLines = currentDoc.lines.slice()
              const removed: number[] = []

              for (let i = normStart.line; i <= normEnd.line; i++) {
                if (shift) {
                  const line = newLines[i]
                  let n = 0
                  while (n < tabSize && n < line.length && line[n] === ' ') n++
                  newLines[i] = line.slice(n)
                  removed.push(n)
                } else {
                  newLines[i] = spaces + newLines[i]
                  removed.push(0)
                }
              }

              // Patch tokenLines eagerly so the next repaint uses correct data
              // instead of the stale useDeferredValue result.
              const tls = tokenLinesRef.current
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
                tokenLinesPatchRef.current = newTls
              }

              const adjustCol = (c: Cursor): Cursor => {
                if (c.line < normStart.line || c.line > normEnd.line) return c
                const n = removed[c.line - normStart.line]
                return shift
                  ? { line: c.line, col: Math.max(0, c.col - n) }
                  : { line: c.line, col: c.col + tabSize }
              }

              const newDoc = { ...currentDoc, lines: newLines, cursor: adjustCol(sel.head) }
              commitUpdate(newDoc, adjustCol(sel.anchor))
              return
            }
          }

          if (shift) return
          applyToAllCursorsRef.current((d, s) => {
            const base = s && !isCollapsed(s) ? deleteSelectedText(d, s) : d
            return insert(base, '  ')
          })
          break
        }
      }
    },
    [commitUpdate, cursorFromPointer],
  )

  // ---- Character input via native beforeinput (non-IME) ----
  const mountTextarea = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) return undefined
      textareaRef.current = el

      const onBeforeInput = (e: InputEvent): void => {
        if (isComposingRef.current || !e.data) return
        e.preventDefault()
        const char = e.data
        applyToAllCursorsRef.current((d, sel) => {
          const base = sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : d
          return insert(base, char)
        })
      }

      const onBlur = (e: FocusEvent) => {
        if (e.relatedTarget === null && isEditorActiveRef.current) {
          requestAnimationFrame(() => {
            if (isEditorActiveRef.current) textareaRef.current?.focus({ preventScroll: true })
          })
        }
      }

      el.addEventListener('beforeinput', onBeforeInput as EventListener)
      el.addEventListener('blur', onBlur)
      return () => {
        el.removeEventListener('beforeinput', onBeforeInput as EventListener)
        el.removeEventListener('blur', onBlur)
      }
    },
    [],
  )

  // ---- IME ----
  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLTextAreaElement>) => {
      isComposingRef.current = false
      if (textareaRef.current) textareaRef.current.value = ''
      if (e.data) {
        const text = e.data
        applyToAllCursorsRef.current((d, sel) => {
          const base = sel && !isCollapsed(sel) ? deleteSelectedText(d, sel) : d
          return insert(base, text)
        })
      }
    },
    [],
  )

  useImperativeHandle(ref, () => ({
    getTopLine() {
      const container = containerRef.current
      if (!container) return 0
      return Math.max(0, Math.floor((container.scrollTop - PADDING_TOP) / lineHeight))
    },
    scrollToLine(line: number) {
      const container = containerRef.current
      if (container) container.scrollTop = PADDING_TOP + line * lineHeight
    },
    getVisibleLines() {
      const container = containerRef.current
      if (!container) return { from: 0, to: 0 }
      const from = Math.max(0, Math.floor((container.scrollTop - PADDING_TOP) / lineHeight))
      const to = Math.floor((container.scrollTop + container.clientHeight - PADDING_TOP) / lineHeight)
      return { from, to }
    },
  }), [lineHeight])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'auto',
        height: '100%',
        width: '100%',
        outline: 'none',
        cursor: 'text',
        ...style,
      }}
      onScroll={() => {
        repaint()
        const b = bindingRef.current
        if (!b || !activeRef.current) return
        const container = containerRef.current
        if (!container) return
        const topLine = Math.max(0, Math.floor((container.scrollTop - PADDING_TOP) / lineHeightRef.current))
        b.reportSourceLine(topLine)
      }}
      onClick={(e) => {
        if (e.target === containerRef.current) textareaRef.current?.focus({ preventScroll: true })
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'sticky', top: 0, display: 'block', width: '100%' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onContextMenu={handleContextMenu}
        />
      </div>

      {menuPos && (
        <ContextMenu
          x={menuPos.x}
          y={menuPos.y}
          items={menuItems}
          onClose={() => setMenuPos(null)}
        />
      )}

      <textarea
        ref={mountTextarea}
        rows={1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1,
          height: 1,
          opacity: 0,
          overflow: 'hidden',
          resize: 'none',
          border: 'none',
          outline: 'none',
          padding: 0,
          pointerEvents: 'none',
        }}
        onKeyDown={handleKeyDown}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
    </div>
  )
})
