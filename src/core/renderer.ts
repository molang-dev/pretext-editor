import type { Cursor, Selection } from './document'
import { isCollapsed, normalizeSelection } from './document'

export type TokenSpan = { text: string; color: string }
export type TokenizedLine = TokenSpan[]

export const DEFAULT_FONT_SIZE = 14
export const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'
export const DEFAULT_TAB_SIZE = 4
export const PADDING_LEFT = 52
export const PADDING_TOP = 8
export const FONT_SIZE_TO_LINE_HEIGHT = (size: number): number => size + 8

const BG = '#1e1e1e'
const FG = '#d4d4d4'
const GUTTER_BG = '#1e1e1e'
const GUTTER_FG = '#6e7681'
const CURSOR_COLOR = '#d4d4d4'
const CURRENT_LINE_BG = 'rgba(255,255,255,0.04)'
const SELECTION_BG = '#264f78'
const INDENT_GUIDE = 'rgba(255,255,255,0.1)'
const INDENT_GUIDE_ACTIVE = 'rgba(255,255,255,0.3)'

export interface RenderOptions {
  canvas: HTMLCanvasElement
  lines: string[]
  cursor: Cursor
  selection?: Selection | null
  extraCursors?: Array<{ head: Cursor; anchor: Cursor | null }>
  scrollTop: number
  fontSize?: number
  fontFamily?: string
  tabSize?: number
  tokenLines?: TokenizedLine[]
  cursorVisible?: boolean
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
function measureWithTabs(ctx: CanvasRenderingContext2D, text: string, tabWidth: number): number {
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

export function renderCanvas({
  canvas,
  lines,
  cursor,
  selection,
  extraCursors,
  scrollTop,
  fontSize = DEFAULT_FONT_SIZE,
  fontFamily = DEFAULT_FONT_FAMILY,
  tabSize = DEFAULT_TAB_SIZE,
  tokenLines,
  cursorVisible = true,
}: RenderOptions): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const w = canvas.width / dpr
  const h = canvas.height / dpr
  const lineHeight = FONT_SIZE_TO_LINE_HEIGHT(fontSize)
  const font = `${fontSize}px ${fontFamily}`

  ctx.save()
  ctx.scale(dpr, dpr)

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, w, h)

  const firstLine = Math.max(0, Math.floor(scrollTop / lineHeight) - 1)
  const lastLine = Math.min(lines.length - 1, Math.ceil((scrollTop + h) / lineHeight))

  ctx.font = font

  const spaceW = ctx.measureText(' ').width
  const { rawLevels, effectiveLevels, indentUnit } = buildGuideData(lines, tabSize)
  const activeGuideLevel = activeBracketLevel(lines, cursor.line, rawLevels, effectiveLevels)

  const hasSel = selection && !isCollapsed(selection)
  const [selStart, selEnd] = hasSel ? normalizeSelection(selection!) : [cursor, cursor]

  for (let i = firstLine; i <= lastLine; i++) {
    const y = PADDING_TOP + i * lineHeight - scrollTop
    const lineText = lines[i] ?? ''

    // Current line background — only when no active selection
    if (i === cursor.line && !hasSel) {
      ctx.fillStyle = CURRENT_LINE_BG
      ctx.fillRect(0, y, w, lineHeight)
    }

    // Indent guides — draw at every level strictly contained by this line's indent.
    // Rule: guide g appears if rawLevel >= g (non-empty) or effectiveLevel >= g (empty).
    // This means {-lines and }-lines at level g-1 are excluded naturally.
    const rl = rawLevels[i]
    const el = effectiveLevels[i] ?? 0
    const maxG = rl === -1 ? el : rl
    for (let g = 1; g <= maxG; g++) {
      const gx = Math.floor(PADDING_LEFT + 4 + (g - 1) * indentUnit * spaceW)
      ctx.fillStyle = g === activeGuideLevel ? INDENT_GUIDE_ACTIVE : INDENT_GUIDE
      ctx.fillRect(gx, y, 1, lineHeight)
    }

    // Selection highlight (primary)
    if (hasSel && i >= selStart.line && i <= selEnd.line) {
      const colStart = i === selStart.line ? selStart.col : 0
      const colEnd = i === selEnd.line ? selEnd.col : lineText.length

      ctx.font = font
      const xStart = PADDING_LEFT + 4 + measureWithTabs(ctx, lineText.slice(0, colStart), tabSize)
      const xEnd =
        i === selEnd.line
          ? PADDING_LEFT + 4 + measureWithTabs(ctx, lineText.slice(0, colEnd), tabSize)
          : w

      ctx.fillStyle = SELECTION_BG
      ctx.fillRect(xStart, y, Math.max(xEnd - xStart, 2), lineHeight)
    }

    // Selection highlight (extra cursors)
    for (const slot of extraCursors ?? []) {
      if (!slot.anchor) continue
      const [exS, exE] = normalizeSelection({ anchor: slot.anchor, head: slot.head })
      if (isCollapsed({ anchor: exS, head: exE }) || i < exS.line || i > exE.line) continue
      const colStart = i === exS.line ? exS.col : 0
      const colEnd = i === exE.line ? exE.col : lineText.length
      const xStart = PADDING_LEFT + 4 + measureWithTabs(ctx, lineText.slice(0, colStart), tabSize)
      const xEnd =
        i === exE.line
          ? PADDING_LEFT + 4 + measureWithTabs(ctx, lineText.slice(0, colEnd), tabSize)
          : w
      ctx.fillStyle = SELECTION_BG
      ctx.fillRect(xStart, y, Math.max(xEnd - xStart, 2), lineHeight)
    }

    // Gutter
    ctx.fillStyle = GUTTER_BG
    ctx.fillRect(0, y, PADDING_LEFT, lineHeight)

    // Line number
    ctx.fillStyle = i === cursor.line ? FG : GUTTER_FG
    ctx.textAlign = 'right'
    ctx.textBaseline = 'top'
    ctx.fillText(String(i + 1), PADDING_LEFT + 4 - 2 * spaceW, y + Math.floor((lineHeight - fontSize) / 2))

    // Line text (syntax-highlighted or plain)
    // Always draw lineText chars (not span.text) so text position stays in sync
    // with selection even when tokenLines are stale (useDeferredValue lag).
    // Monaco-style: never clear tokens — if stale spans run short, extend with
    // the last span's color rather than falling back to FG (avoids white flash).
    const tokenLine = tokenLines?.[i]
    const textY = y + Math.floor((lineHeight - fontSize) / 2)
    ctx.textAlign = 'left'
    if (tokenLine && tokenLine.length > 0) {
      let xOff = PADDING_LEFT + 4
      let charOff = 0
      for (const span of tokenLine) {
        if (charOff >= lineText.length) break
        const end = Math.min(charOff + span.text.length, lineText.length)
        ctx.fillStyle = span.color
        xOff = fillTextWithTabs(ctx, lineText.slice(charOff, end), xOff, textY, tabSize)
        charOff = end
      }
      if (charOff < lineText.length) {
        // Stale spans ran out — extend with last span's color, not FG
        ctx.fillStyle = tokenLine[tokenLine.length - 1].color
        fillTextWithTabs(ctx, lineText.slice(charOff), xOff, textY, tabSize)
      }
    } else {
      ctx.fillStyle = FG
      fillTextWithTabs(ctx, lineText, PADDING_LEFT + 4, textY, tabSize)
    }

    // Cursor (primary)
    if (cursorVisible && i === cursor.line) {
      const textBefore = lineText.slice(0, cursor.col)
      const cursorX = PADDING_LEFT + 4 + measureWithTabs(ctx, textBefore, tabSize)
      ctx.fillStyle = CURSOR_COLOR
      ctx.fillRect(Math.floor(cursorX), y + 2, 2, lineHeight - 4)
    }

    // Cursors (extra)
    if (cursorVisible) {
      for (const slot of extraCursors ?? []) {
        if (i !== slot.head.line) continue
        const xExtra = PADDING_LEFT + 4 + measureWithTabs(ctx, lineText.slice(0, slot.head.col), tabSize)
        ctx.fillStyle = CURSOR_COLOR
        ctx.fillRect(Math.floor(xExtra), y + 2, 2, lineHeight - 4)
      }
    }
  }

  ctx.restore()
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
