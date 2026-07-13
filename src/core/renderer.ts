import type { Cursor, Selection } from './document'
import { isCollapsed, normalizeSelection } from './document'
import type { SearchMatch } from './search'
import { log } from '@molang/alogjs'

declare const __DEV__: boolean

export type TokenSpan = { text: string; color: string }
export type TokenizedLine = TokenSpan[]

export const DEFAULT_FONT_SIZE = 14
export const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'
export const DEFAULT_TAB_SIZE = 4
export const PADDING_LEFT = 52
export const PADDING_TOP = 8
export const FONT_SIZE_TO_LINE_HEIGHT = (size: number): number => size + 8

export type EditorThemeColors = {
  bg: string
  fg: string
  gutterBg: string
  gutterFg: string
  cursorColor: string
  currentLineBg: string
  selectionBg: string
  indentGuide: string
  indentGuideActive: string
  searchMatchBg: string
  searchCurrentBg: string
}

export const BUILT_IN_THEMES: Record<string, EditorThemeColors> = {
  'dark-plus': {
    bg: '#1e1e1e', fg: '#d4d4d4',
    gutterBg: '#1e1e1e', gutterFg: '#6e7681',
    cursorColor: '#d4d4d4',
    currentLineBg: 'rgba(255,255,255,0.04)',
    selectionBg: '#264f78',
    indentGuide: 'rgba(255,255,255,0.1)', indentGuideActive: 'rgba(255,255,255,0.3)',
    searchMatchBg: 'rgba(220,200,60,0.28)', searchCurrentBg: 'rgba(255,140,0,0.5)',
  },
  'dracula': {
    bg: '#282A36', fg: '#F8F8F2',
    gutterBg: '#282A36', gutterFg: '#6272A4',
    cursorColor: '#F8F8F2',
    currentLineBg: 'rgba(255,255,255,0.04)',
    selectionBg: '#44475A',
    indentGuide: 'rgba(255,255,255,0.08)', indentGuideActive: 'rgba(255,255,255,0.25)',
    searchMatchBg: 'rgba(255,184,108,0.3)', searchCurrentBg: 'rgba(255,121,198,0.5)',
  },
  'github-light': {
    bg: '#ffffff', fg: '#24292e',
    gutterBg: '#ffffff', gutterFg: '#8a8a8a',
    cursorColor: '#24292e',
    currentLineBg: 'rgba(0,0,0,0.04)',
    selectionBg: '#b3d7ff',
    indentGuide: 'rgba(0,0,0,0.1)', indentGuideActive: 'rgba(0,0,0,0.3)',
    searchMatchBg: 'rgba(200,160,0,0.2)', searchCurrentBg: 'rgba(255,140,0,0.4)',
  },
}

export interface RenderOptions {
  canvas: HTMLCanvasElement
  lines: string[]
  cursor: Cursor
  selection?: Selection | null
  extraCursors?: Array<{ head: Cursor; anchor: Cursor | null }>
  scrollTop: number
  scrollLeft?: number
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  tokenLines?: TokenizedLine[]
  cursorVisible?: boolean
  searchHighlights?: SearchMatch[]
  searchCurrentIdx?: number
  theme?: string
  singleLine?: number
  visualLayout?: VisualLayout
  dirtyLines?: Set<number>
}

export type VisualRow = { logLine: number; startCol: number; endCol: number }
export type VisualLayout = {
  rows: VisualRow[]
  logToFirstVisual: number[]
}


/** Count leading-whitespace depth in spaces (tabs expand to tabSize) */
function indentDepth(text: string, tabSize: number): number {
  let depth = 0
  for (const ch of text) {
    if (ch === ' ') depth++
    else if (ch === '\t') depth = Math.ceil((depth + 1) / tabSize) * tabSize
    else break
  }
  return depth
}

/** Detect the file's actual indent unit (minimum non-zero indent depth). */
function detectIndentUnit(lines: string[], tabSize: number): number {
  let unit = Infinity
  for (const line of lines) {
    if (line.trim() === '') continue
    const d = indentDepth(line, tabSize)
    if (d > 0) unit = Math.min(unit, d)
  }
  return isFinite(unit) ? unit : tabSize
}

let _guideCache: {
  lines: string[]
  tabSize: number
  result: { rawLevels: number[]; effectiveLevels: number[]; indentUnit: number }
} | null = null

let _ablCache: {
  lines: string[]
  cursorLine: number
  result: number
} | null = null

function buildGuideData(
  lines: string[],
  tabSize: number,
): { rawLevels: number[]; effectiveLevels: number[]; indentUnit: number } {
  const indentUnit = detectIndentUnit(lines, tabSize)
  const rawLevels = lines.map((l) =>
    l.trim() === '' ? -1 : Math.floor(indentDepth(l, tabSize) / indentUnit),
  )
  const effectiveLevels = rawLevels.slice()
  let prev = 0
  for (let i = 0; i < effectiveLevels.length; i++) {
    if (effectiveLevels[i] === -1) effectiveLevels[i] = prev
    else prev = effectiveLevels[i]
  }
  let next = 0
  for (let i = effectiveLevels.length - 1; i >= 0; i--) {
    if (rawLevels[i] === -1) effectiveLevels[i] = Math.min(effectiveLevels[i], next)
    else next = effectiveLevels[i]
  }
  return { rawLevels, effectiveLevels, indentUnit }
}

/**
 * Walk upward from cursorLine, bracket-balance scanning, to find the innermost
 * enclosing bracket pair ({}/[]/()). Returns the indent level of the content
 * inside that pair. Falls back to the cursor line's own level when no enclosing
 * bracket exists (mirrors Monaco's indentation-based fallback).
 */
function activeBracketLevel(
  lines: string[],
  cursorLine: number,
  rawLevels: number[],
  effectiveLevels: number[],
): number {
  const lvl = (i: number) => (rawLevels[i] === -1 ? (effectiveLevels[i] ?? 0) : rawLevels[i])
  let depth = 0
  for (let i = cursorLine; i >= 0; i--) {
    const text = lines[i]
    for (let j = text.length - 1; j >= 0; j--) {
      const ch = text[j]
      if (ch === '}' || ch === ']' || ch === ')') {
        depth++
      } else if (ch === '{' || ch === '[' || ch === '(') {
        if (depth > 0) {
          depth--
        } else {
          // innermost enclosing opener at line i — content level is the first non-empty line after it
          for (let k = i + 1; k < lines.length && k <= i + 100; k++) {
            if (lines[k].trim() !== '') return lvl(k)
          }
          return lvl(i) + 1
        }
      }
    }
  }
  return lvl(cursorLine)
}

/** Measure text width, treating \t as tabSize spaces */
export function measureWithTabs(ctx: CanvasRenderingContext2D, text: string, tabWidth: number): number {
  if (!text.includes('\t')) return ctx.measureText(text).width
  const spaceW = ctx.measureText(' ').width
  let w = 0
  for (const ch of text) {
    w += ch === '\t' ? spaceW * tabWidth : ctx.measureText(ch).width
  }
  return w
}

/** Draw text, treating \t as tabSize spaces */
function fillTextWithTabs(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tabWidth: number,
): number {
  if (!text.includes('\t')) {
    ctx.fillText(text, x, y)
    return x + ctx.measureText(text).width
  }
  const spaceW = ctx.measureText(' ').width
  let xOff = x
  for (const ch of text) {
    if (ch === '\t') {
      xOff += spaceW * tabWidth
    } else {
      ctx.fillText(ch, xOff, y)
      xOff += ctx.measureText(ch).width
    }
  }
  return xOff
}

/** Split logical lines into visual rows based on available pixel width. */
export function computeVisualLayout(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  availableWidth: number,
  tabSize: number,
): VisualLayout {
  const rows: VisualRow[] = []
  const logToFirstVisual: number[] = []
  for (let li = 0; li < lines.length; li++) {
    const text = lines[li]
    logToFirstVisual.push(rows.length)
    if (text === '') {
      rows.push({ logLine: li, startCol: 0, endCol: 0 })
      continue
    }
    let col = 0
    while (col < text.length) {
      if (measureWithTabs(ctx, text.slice(col), tabSize) <= availableWidth) {
        rows.push({ logLine: li, startCol: col, endCol: text.length })
        break
      }
      let lo = col + 1, hi = text.length
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (measureWithTabs(ctx, text.slice(col, mid), tabSize) <= availableWidth) lo = mid
        else hi = mid - 1
      }
      const breakAt = Math.max(col + 1, lo)
      rows.push({ logLine: li, startCol: col, endCol: breakAt })
      col = breakAt
    }
  }
  return { rows, logToFirstVisual }
}

export function renderCanvas({
  canvas,
  lines,
  cursor,
  selection,
  extraCursors,
  scrollTop,
  scrollLeft = 0,
  fontSize = DEFAULT_FONT_SIZE,
  fontFamily = DEFAULT_FONT_FAMILY,
  tabSize = DEFAULT_TAB_SIZE,
  tokenLines,
  cursorVisible = true,
  searchHighlights,
  searchCurrentIdx = -1,
  theme,
  singleLine,
  visualLayout,
  dirtyLines,
}: RenderOptions): { gutterWidth: number } {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { gutterWidth: PADDING_LEFT }
  const tc = BUILT_IN_THEMES[theme ?? 'dark-plus'] ?? BUILT_IN_THEMES['dark-plus']
  canvas.style.backgroundColor = tc.bg

  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  const lineHeight = FONT_SIZE_TO_LINE_HEIGHT(fontSize)
  const font = `${fontSize}px ${fontFamily}`

  ctx.save()
  ctx.scale(dpr, dpr)
  ctx.font = font
  const spaceW = ctx.measureText(' ').width
  const numDigits = String(lines.length).length
  const gutterWidth = ctx.measureText('0'.repeat(numDigits)).width + 4 * spaceW

  // Compute visible range (visual rows for wordWrap, logical lines otherwise)
  let firstVR = 0, lastVR = 0
  let firstLine = 0, lastLine = 0
  if (visualLayout) {
    if (singleLine !== undefined) {
      firstVR = visualLayout.logToFirstVisual[singleLine] ?? singleLine
      lastVR = firstVR
      while (lastVR + 1 < visualLayout.rows.length && visualLayout.rows[lastVR + 1].logLine === singleLine) lastVR++
    } else {
      firstVR = Math.max(0, Math.floor(scrollTop / lineHeight) - 1)
      lastVR = Math.min(visualLayout.rows.length - 1, Math.ceil((scrollTop + h) / lineHeight))
    }
  } else {
    firstLine = singleLine !== undefined
      ? Math.max(0, singleLine)
      : Math.max(0, Math.floor(scrollTop / lineHeight) - 1)
    lastLine = singleLine !== undefined
      ? Math.min(lines.length - 1, singleLine)
      : Math.min(lines.length - 1, Math.ceil((scrollTop + h) / lineHeight))
  }

  const dirtyTag = singleLine !== undefined ? ' (cursor-line only)' : dirtyLines ? ` (dirty:${[...dirtyLines].join(',')})` : ''
  if (__DEV__) log.D('draw', 'firstLine=%v lastLine=%v total=%v%v', firstLine, lastLine, lines.length, dirtyTag)

  // singleLine mode: clip to that row's pixel rect
  if (singleLine !== undefined) {
    const clipY = visualLayout
      ? PADDING_TOP + firstVR * lineHeight - scrollTop
      : PADDING_TOP + singleLine * lineHeight - scrollTop
    const clipH = visualLayout ? (lastVR - firstVR + 1) * lineHeight : lineHeight
    ctx.beginPath()
    ctx.rect(0, clipY, w, clipH)
    ctx.clip()
  }

  ctx.fillStyle = tc.bg
  if (dirtyLines) {
    // Partial repaint: clear only dirty lines
    if (visualLayout) {
      for (let vr = firstVR; vr <= lastVR; vr++) {
        if (!dirtyLines.has(visualLayout.rows[vr].logLine)) continue
        ctx.fillRect(0, PADDING_TOP + vr * lineHeight - scrollTop, w, lineHeight)
      }
    } else {
      for (let i = firstLine; i <= lastLine; i++) {
        if (!dirtyLines.has(i)) continue
        ctx.fillRect(0, PADDING_TOP + i * lineHeight - scrollTop, w, lineHeight)
      }
    }
  } else {
    ctx.fillRect(0, 0, w, h)
  }

  if (!_guideCache || _guideCache.lines !== lines || _guideCache.tabSize !== tabSize) {
    _guideCache = { lines, tabSize, result: buildGuideData(lines, tabSize) }
  }
  const { rawLevels, effectiveLevels, indentUnit } = _guideCache.result

  if (!_ablCache || _ablCache.lines !== lines || _ablCache.cursorLine !== cursor.line) {
    _ablCache = { lines, cursorLine: cursor.line, result: activeBracketLevel(lines, cursor.line, rawLevels, effectiveLevels) }
  }
  const activeGuideLevel = _ablCache.result

  const hasSel = selection && !isCollapsed(selection)
  const [selStart, selEnd] = hasSel ? normalizeSelection(selection!) : [cursor, cursor]
  if (__DEV__ && hasSel) log.D('render', 'hasSel selStart=%v selEnd=%v firstLine=%v lastLine=%v', selStart.line, selEnd.line, firstLine, lastLine)

  // Binary search for search highlights in visible logical line range
  const firstLogLine = visualLayout
    ? (firstVR < visualLayout.rows.length ? visualLayout.rows[firstVR].logLine : 0)
    : firstLine
  const lastLogLine = visualLayout
    ? (lastVR < visualLayout.rows.length ? visualLayout.rows[lastVR].logLine : lines.length - 1)
    : lastLine
  let hiStart = 0
  let hiEnd = 0
  if (searchHighlights && searchHighlights.length > 0) {
    let lo = 0, hi = searchHighlights.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (searchHighlights[mid].head.line < firstLogLine) lo = mid + 1
      else hi = mid
    }
    hiStart = lo
    lo = hiStart; hi = searchHighlights.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (searchHighlights[mid].anchor.line <= lastLogLine) lo = mid + 1
      else hi = mid
    }
    hiEnd = lo
  }

  if (visualLayout) {
    // ---- Word-wrap path: iterate visual rows ----
    for (let vr = firstVR; vr <= lastVR; vr++) {
      const { logLine, startCol, endCol } = visualLayout.rows[vr]
      if (dirtyLines && !dirtyLines.has(logLine)) continue
      const isFirstVR = vr === visualLayout.logToFirstVisual[logLine]
      const y = PADDING_TOP + vr * lineHeight - scrollTop
      const lineText = lines[logLine] ?? ''
      const textY = y + Math.floor((lineHeight - fontSize) / 2)

      // Current line background
      if (logLine === cursor.line && !hasSel) {
        ctx.fillStyle = tc.currentLineBg
        ctx.fillRect(0, y, w, lineHeight)
      }

      // Search highlights
      if (searchHighlights && hiStart < hiEnd) {
        ctx.font = font
        for (let mi = hiStart; mi < hiEnd; mi++) {
          const m = searchHighlights[mi]
          if (logLine < m.anchor.line || logLine > m.head.line) continue
          const mColS = Math.max(startCol, logLine === m.anchor.line ? m.anchor.col : 0)
          const mColE = Math.min(endCol, logLine === m.head.line ? m.head.col : lineText.length)
          if (mColS >= mColE) continue
          const xS = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, mColS), tabSize)
          const xE = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, mColE), tabSize)
          ctx.fillStyle = mi === searchCurrentIdx ? tc.searchCurrentBg : tc.searchMatchBg
          ctx.fillRect(xS, y, Math.max(xE - xS, 2), lineHeight)
        }
      }

      // Indent guides — first visual row of logical line only
      if (isFirstVR) {
        const rl = rawLevels[logLine]
        const el = effectiveLevels[logLine] ?? 0
        const maxG = rl === -1 ? el : rl
        for (let g = 1; g <= maxG; g++) {
          const gx = Math.floor(gutterWidth + (g - 1) * indentUnit * spaceW)
          ctx.fillStyle = g === activeGuideLevel ? tc.indentGuideActive : tc.indentGuide
          ctx.fillRect(gx, y, 1, lineHeight)
        }
      }

      // Selection (primary)
      if (hasSel && logLine >= selStart.line && logLine <= selEnd.line) {
        const rawColStart = logLine === selStart.line ? selStart.col : 0
        const rawColEnd = logLine === selEnd.line ? selEnd.col : lineText.length
        if (rawColStart < endCol && rawColEnd > startCol) {
          const visColStart = Math.max(startCol, rawColStart)
          const isSelEnd = logLine === selEnd.line && rawColEnd <= endCol
          const xStart = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, visColStart), tabSize)
          const xEnd = isSelEnd
            ? gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, rawColEnd), tabSize)
            : gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, endCol), tabSize) + spaceW * 0.5
          ctx.fillStyle = tc.selectionBg
          ctx.fillRect(xStart, y, Math.max(xEnd - xStart, 2), lineHeight)
        }
      }

      // Selection (extra cursors)
      for (const slot of extraCursors ?? []) {
        if (!slot.anchor) continue
        const [exS, exE] = normalizeSelection({ anchor: slot.anchor, head: slot.head })
        if (isCollapsed({ anchor: exS, head: exE }) || logLine < exS.line || logLine > exE.line) continue
        const rawColStart = logLine === exS.line ? exS.col : 0
        const rawColEnd = logLine === exE.line ? exE.col : lineText.length
        if (rawColStart < endCol && rawColEnd > startCol) {
          const visColStart = Math.max(startCol, rawColStart)
          const isSelEnd = logLine === exE.line && rawColEnd <= endCol
          const xStart = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, visColStart), tabSize)
          const xEnd = isSelEnd
            ? gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, rawColEnd), tabSize)
            : gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, endCol), tabSize) + spaceW * 0.5
          ctx.fillStyle = tc.selectionBg
          ctx.fillRect(xStart, y, Math.max(xEnd - xStart, 2), lineHeight)
        }
      }

      // Gutter background
      ctx.fillStyle = tc.gutterBg
      ctx.fillRect(0, y, gutterWidth, lineHeight)

      // Line number — only on first visual row of logical line; empty gutter on wrapped rows
      ctx.textBaseline = 'top'
      if (isFirstVR) {
        ctx.fillStyle = logLine === cursor.line ? tc.fg : tc.gutterFg
        ctx.textAlign = 'right'
        ctx.fillText(String(logLine + 1), gutterWidth - 2 * spaceW, y + Math.floor((lineHeight - fontSize) / 2))
      }

      // Text + cursors (clipped to content area)
      ctx.textAlign = 'left'
      ctx.save()
      ctx.beginPath()
      ctx.rect(gutterWidth, 0, w - gutterWidth, h)
      ctx.clip()
      const tokenLine = tokenLines?.[logLine]
      if (tokenLine && tokenLine.length > 0) {
        let charOff = 0
        for (const span of tokenLine) {
          const spanEnd = Math.min(charOff + span.text.length, lineText.length)
          if (spanEnd <= startCol) { charOff = spanEnd; continue }
          if (charOff >= endCol) break
          const drawStart = Math.max(charOff, startCol)
          const drawEnd = Math.min(spanEnd, endCol)
          const chunkX = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, drawStart), tabSize)
          ctx.fillStyle = span.color
          fillTextWithTabs(ctx, lineText.slice(drawStart, drawEnd), chunkX, textY, tabSize)
          charOff = spanEnd
        }
        // Stale-span fallback: extend with last span's color
        if (charOff < endCol && tokenLine.length > 0) {
          const drawStart = Math.max(charOff, startCol)
          if (drawStart < endCol) {
            const chunkX = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, drawStart), tabSize)
            ctx.fillStyle = tokenLine[tokenLine.length - 1].color
            fillTextWithTabs(ctx, lineText.slice(drawStart, endCol), chunkX, textY, tabSize)
          }
        }
      } else {
        if (__DEV__) log.D('draw', 'line %v plain cols %v..%v of %v xStart=%v canvasW=%v', logLine, startCol, endCol, lineText.length, gutterWidth, w)
        ctx.fillStyle = tc.fg
        fillTextWithTabs(ctx, lineText.slice(startCol, endCol), gutterWidth, textY, tabSize)
      }

      // Cursor (primary)
      if (cursorVisible && cursor.line === logLine) {
        const col = cursor.col
        if (col >= startCol && col <= endCol) {
          const cursorX = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, col), tabSize)
          ctx.fillStyle = tc.cursorColor
          ctx.fillRect(Math.floor(cursorX), y + 2, 2, lineHeight - 4)
        }
      }

      // Cursors (extra)
      if (cursorVisible) {
        for (const slot of extraCursors ?? []) {
          if (slot.head.line !== logLine) continue
          const col = slot.head.col
          if (col < startCol || col > endCol) continue
          const xExtra = gutterWidth + measureWithTabs(ctx, lineText.slice(startCol, col), tabSize)
          ctx.fillStyle = tc.cursorColor
          ctx.fillRect(Math.floor(xExtra), y + 2, 2, lineHeight - 4)
        }
      }
      ctx.restore()
    }
  } else {
    // ---- Normal path: iterate logical lines ----
    for (let i = firstLine; i <= lastLine; i++) {
      if (dirtyLines && !dirtyLines.has(i)) continue
      const y = PADDING_TOP + i * lineHeight - scrollTop
      const lineText = lines[i] ?? ''

      // Current line background — only when no active selection
      if (i === cursor.line && !hasSel) {
        ctx.fillStyle = tc.currentLineBg
        ctx.fillRect(0, y, w, lineHeight)
      }

      // Search match highlights (drawn under selection)
      if (searchHighlights && hiStart < hiEnd) {
        ctx.font = font
        for (let mi = hiStart; mi < hiEnd; mi++) {
          const m = searchHighlights[mi]
          if (i < m.anchor.line || i > m.head.line) continue
          const colS = i === m.anchor.line ? m.anchor.col : 0
          const colE = i === m.head.line ? m.head.col : lineText.length
          const xS = gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, colS), tabSize)
          const xE = gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, colE), tabSize)
          ctx.fillStyle = mi === searchCurrentIdx ? tc.searchCurrentBg : tc.searchMatchBg
          ctx.fillRect(xS, y, Math.max(xE - xS, 2), lineHeight)
        }
      }

      // Indent guides
      const rl = rawLevels[i]
      const el = effectiveLevels[i] ?? 0
      const maxG = rl === -1 ? el : rl
      for (let g = 1; g <= maxG; g++) {
        const gx = Math.floor(gutterWidth - scrollLeft + (g - 1) * indentUnit * spaceW)
        ctx.fillStyle = g === activeGuideLevel ? tc.indentGuideActive : tc.indentGuide
        ctx.fillRect(gx, y, 1, lineHeight)
      }

      // Selection highlight (primary)
      if (hasSel && i >= selStart.line && i <= selEnd.line) {
        const colStart = i === selStart.line ? selStart.col : 0
        const colEnd = i === selEnd.line ? selEnd.col : lineText.length

        ctx.font = font
        const xStart = gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, colStart), tabSize)
        const xEnd =
          i === selEnd.line
            ? gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, colEnd), tabSize)
            : gutterWidth - scrollLeft + measureWithTabs(ctx, lineText, tabSize) + ctx.measureText(' ').width * 0.5

        ctx.fillStyle = tc.selectionBg
        ctx.fillRect(xStart, y, Math.max(xEnd - xStart, 2), lineHeight)
      }

      // Selection highlight (extra cursors)
      for (const slot of extraCursors ?? []) {
        if (!slot.anchor) continue
        const [exS, exE] = normalizeSelection({ anchor: slot.anchor, head: slot.head })
        if (isCollapsed({ anchor: exS, head: exE }) || i < exS.line || i > exE.line) continue
        const colStart = i === exS.line ? exS.col : 0
        const colEnd = i === exE.line ? exE.col : lineText.length
        const xStart = gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, colStart), tabSize)
        const xEnd =
          i === exE.line
            ? gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, colEnd), tabSize)
            : gutterWidth - scrollLeft + measureWithTabs(ctx, lineText, tabSize) + ctx.measureText(' ').width * 0.5
        ctx.fillStyle = tc.selectionBg
        ctx.fillRect(xStart, y, Math.max(xEnd - xStart, 2), lineHeight)
      }

      // Gutter
      ctx.fillStyle = tc.gutterBg
      ctx.fillRect(0, y, gutterWidth, lineHeight)

      // Line number
      ctx.fillStyle = i === cursor.line ? tc.fg : tc.gutterFg
      ctx.textAlign = 'right'
      ctx.textBaseline = 'top'
      ctx.fillText(String(i + 1), gutterWidth - 2 * spaceW, y + Math.floor((lineHeight - fontSize) / 2))

      // Line text (syntax-highlighted or plain) + cursors
      // Clip to content area [gutterWidth, w]: half-chars at boundaries are pixel-clipped.
      // Skip spans fully behind the gutter (xOff + spanW <= gutterWidth) or break when
      // fully past the right edge (xOff >= w) to avoid wasted fillText calls.
      // Always draw lineText chars (not span.text) so text position stays in sync
      // with selection even when tokenLines are stale (useDeferredValue lag).
      // Monaco-style: never clear tokens — if stale spans run short, extend with
      // the last span's color rather than falling back to FG (avoids white flash).
      const tokenLine = tokenLines?.[i]
      const textY = y + Math.floor((lineHeight - fontSize) / 2)
      ctx.textAlign = 'left'
      ctx.save()
      ctx.beginPath()
      ctx.rect(gutterWidth, 0, w - gutterWidth, h)
      ctx.clip()
      if (tokenLine && tokenLine.length > 0) {
        let xOff = gutterWidth - scrollLeft
        let charOff = 0
        let drawFrom = -1
        let drawTo = 0
        for (const span of tokenLine) {
          if (charOff >= lineText.length) break
          const end = Math.min(charOff + span.text.length, lineText.length)
          const chunk = lineText.slice(charOff, end)
          const spanW = measureWithTabs(ctx, chunk, tabSize)
          if (xOff + spanW <= gutterWidth) {
            xOff += spanW
            charOff = end
            continue
          }
          if (xOff >= w) break
          if (drawFrom === -1) drawFrom = charOff
          ctx.fillStyle = span.color
          xOff = fillTextWithTabs(ctx, chunk, xOff, textY, tabSize)
          drawTo = end
          charOff = end
        }
        if (charOff < lineText.length && xOff < w) {
          const chunk = lineText.slice(charOff)
          const spanW = measureWithTabs(ctx, chunk, tabSize)
          if (xOff + spanW > gutterWidth) {
            if (drawFrom === -1) drawFrom = charOff
            ctx.fillStyle = tokenLine[tokenLine.length - 1].color
            fillTextWithTabs(ctx, chunk, xOff, textY, tabSize)
            drawTo = lineText.length
          }
        }
        if (__DEV__) log.D('draw', 'line %v cols %v..%v of %v xStart=%v canvasW=%v', i, drawFrom, drawTo, lineText.length, gutterWidth - scrollLeft, w)
      } else {
        const xLineStart = gutterWidth - scrollLeft
        const lineW = measureWithTabs(ctx, lineText, tabSize)
        if (xLineStart + lineW > gutterWidth && xLineStart < w) {
          const leftClip = Math.max(0, gutterWidth - xLineStart)
          const charStart = leftClip > 0
            ? colFromX(ctx, lineText, leftClip, fontSize, fontFamily, tabSize)
            : 0
          const charEnd = Math.min(
            lineText.length,
            colFromX(ctx, lineText, w - xLineStart, fontSize, fontFamily, tabSize) + 1,
          )
          const drawX = xLineStart + measureWithTabs(ctx, lineText.slice(0, charStart), tabSize)
          ctx.fillStyle = tc.fg
          fillTextWithTabs(ctx, lineText.slice(charStart, charEnd), drawX, textY, tabSize)
          if (__DEV__) log.D('draw', 'line %v plain cols %v..%v of %v xStart=%v canvasW=%v', i, charStart, charEnd, lineText.length, xLineStart, w)
        } else {
          if (__DEV__) log.D('draw', 'line %v plain skipped xStart=%v lineW=%v canvasW=%v', i, xLineStart, lineW, w)
        }
      }

      // Cursor (primary)
      if (cursorVisible && i === cursor.line) {
        const textBefore = lineText.slice(0, cursor.col)
        const cursorX = gutterWidth - scrollLeft + measureWithTabs(ctx, textBefore, tabSize)
        ctx.fillStyle = tc.cursorColor
        ctx.fillRect(Math.floor(cursorX), y + 2, 2, lineHeight - 4)
      }

      // Cursors (extra)
      if (cursorVisible) {
        for (const slot of extraCursors ?? []) {
          if (i !== slot.head.line) continue
          const xExtra = gutterWidth - scrollLeft + measureWithTabs(ctx, lineText.slice(0, slot.head.col), tabSize)
          ctx.fillStyle = tc.cursorColor
          ctx.fillRect(Math.floor(xExtra), y + 2, 2, lineHeight - 4)
        }
      }
      ctx.restore()
    }
  }

  ctx.restore()
  return { gutterWidth }
}

/** Find the column index in `line` closest to pixel offset `targetX`, tab-aware */
export function colFromX(
  ctx: CanvasRenderingContext2D,
  line: string,
  targetX: number,
  fontSize: number,
  fontFamily: string,
  tabSize: number = DEFAULT_TAB_SIZE,
): number {
  ctx.font = `${fontSize}px ${fontFamily}`
  let lo = 0
  let hi = line.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (measureWithTabs(ctx, line.slice(0, mid), tabSize) <= targetX) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}
