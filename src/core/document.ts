export interface Cursor {
  line: number
  col: number
}

export interface Doc {
  lines: string[]
  cursor: Cursor
}

export interface Selection {
  anchor: Cursor
  head: Cursor
}

export function fromString(text: string): Doc {
  const lines = text.split('\n')
  return { lines, cursor: { line: 0, col: 0 } }
}

export function toString(doc: Doc): string {
  return doc.lines.join('\n')
}

export function isCollapsed(sel: Selection): boolean {
  return sel.anchor.line === sel.head.line && sel.anchor.col === sel.head.col
}

// Returns [start, end] in document order (start <= end).
export function normalizeSelection(sel: Selection): [Cursor, Cursor] {
  const { anchor, head } = sel
  const anchorFirst =
    anchor.line < head.line || (anchor.line === head.line && anchor.col <= head.col)
  return anchorFirst ? [anchor, head] : [head, anchor]
}

export function getSelectedText(lines: string[], sel: Selection): string {
  if (isCollapsed(sel)) return ''
  const [start, end] = normalizeSelection(sel)
  if (start.line === end.line) return lines[start.line].slice(start.col, end.col)
  const parts = [lines[start.line].slice(start.col)]
  for (let i = start.line + 1; i < end.line; i++) parts.push(lines[i])
  parts.push(lines[end.line].slice(0, end.col))
  return parts.join('\n')
}

// Delete the selected text and return a new doc with cursor at the deletion point.
export function deleteSelectedText(doc: Doc, sel: Selection): Doc {
  if (isCollapsed(sel)) return doc
  const [start, end] = normalizeSelection(sel)
  const lines = [...doc.lines]
  if (start.line === end.line) {
    lines[start.line] = lines[start.line].slice(0, start.col) + lines[start.line].slice(end.col)
  } else {
    lines.splice(start.line, end.line - start.line + 1, lines[start.line].slice(0, start.col) + lines[end.line].slice(end.col))
  }
  return { lines, cursor: start }
}

export function insert(doc: Doc, text: string): Doc {
  const { line, col } = doc.cursor
  const lines = [...doc.lines]

  if (text === '\n') {
    const before = lines[line].slice(0, col)
    const after = lines[line].slice(col)
    lines.splice(line, 1, before, after)
    return { lines, cursor: { line: line + 1, col: 0 } }
  }

  // Handle multi-line paste
  if (text.includes('\n')) {
    const parts = text.split('\n')
    const before = lines[line].slice(0, col)
    const after = lines[line].slice(col)
    const newLines = [before + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + after]
    lines.splice(line, 1, ...newLines)
    const lastPart = parts[parts.length - 1]
    return { lines, cursor: { line: line + parts.length - 1, col: lastPart.length } }
  }

  lines[line] = lines[line].slice(0, col) + text + lines[line].slice(col)
  return { lines, cursor: { line, col: col + text.length } }
}

export function deleteBackward(doc: Doc): Doc {
  const { line, col } = doc.cursor
  const lines = [...doc.lines]

  if (col > 0) {
    lines[line] = lines[line].slice(0, col - 1) + lines[line].slice(col)
    return { lines, cursor: { line, col: col - 1 } }
  }

  if (line > 0) {
    const prevLen = lines[line - 1].length
    lines.splice(line - 1, 2, lines[line - 1] + lines[line])
    return { lines, cursor: { line: line - 1, col: prevLen } }
  }

  return doc
}

export function deleteForward(doc: Doc): Doc {
  const { line, col } = doc.cursor
  const lines = [...doc.lines]

  if (col < lines[line].length) {
    lines[line] = lines[line].slice(0, col) + lines[line].slice(col + 1)
    return { lines, cursor: { line, col } }
  }

  if (line < lines.length - 1) {
    lines.splice(line, 2, lines[line] + lines[line + 1])
    return { lines, cursor: { line, col } }
  }

  return doc
}

export function moveCursor(doc: Doc, dy: number, dx: number): Doc {
  let { line, col } = doc.cursor

  if (dy !== 0) {
    line = Math.max(0, Math.min(doc.lines.length - 1, line + dy))
    col = Math.min(col, doc.lines[line].length)
  }

  if (dx !== 0) {
    col = Math.max(0, Math.min(doc.lines[line].length, col + dx))
  }

  return { ...doc, cursor: { line, col } }
}

export function moveToLineStart(doc: Doc): Doc {
  return { ...doc, cursor: { line: doc.cursor.line, col: 0 } }
}

export function moveToLineEnd(doc: Doc): Doc {
  const { line } = doc.cursor
  return { ...doc, cursor: { line, col: doc.lines[line].length } }
}

function isWordChar(ch: string): boolean {
  return /\w/.test(ch)
}

export function moveWordLeft(doc: Doc): Doc {
  let { line, col } = doc.cursor
  if (col === 0) {
    if (line === 0) return doc
    line--
    col = doc.lines[line].length
    return { ...doc, cursor: { line, col } }
  }
  const text = doc.lines[line]
  while (col > 0 && (text[col - 1] === ' ' || text[col - 1] === '\t')) col--
  if (col > 0) {
    if (isWordChar(text[col - 1])) {
      while (col > 0 && isWordChar(text[col - 1])) col--
    } else {
      while (col > 0 && !isWordChar(text[col - 1]) && text[col - 1] !== ' ' && text[col - 1] !== '\t') col--
    }
  }
  return { ...doc, cursor: { line, col } }
}

export function moveWordRight(doc: Doc): Doc {
  let { line, col } = doc.cursor
  const text = doc.lines[line]
  if (col === text.length) {
    if (line === doc.lines.length - 1) return doc
    return { ...doc, cursor: { line: line + 1, col: 0 } }
  }
  if (isWordChar(text[col])) {
    while (col < text.length && isWordChar(text[col])) col++
  } else if (text[col] !== ' ' && text[col] !== '\t') {
    while (col < text.length && !isWordChar(text[col]) && text[col] !== ' ' && text[col] !== '\t') col++
  }
  while (col < text.length && (text[col] === ' ' || text[col] === '\t')) col++
  return { ...doc, cursor: { line, col } }
}

export function deleteWordBackward(doc: Doc): Doc {
  const moved = moveWordLeft(doc)
  if (moved.cursor.line === doc.cursor.line && moved.cursor.col === doc.cursor.col) return doc
  return deleteSelectedText(doc, { anchor: moved.cursor, head: doc.cursor })
}

export function deleteWordForward(doc: Doc): Doc {
  const moved = moveWordRight(doc)
  if (moved.cursor.line === doc.cursor.line && moved.cursor.col === doc.cursor.col) return doc
  return deleteSelectedText(doc, { anchor: doc.cursor, head: moved.cursor })
}

export function moveToFileStart(doc: Doc): Doc {
  return { ...doc, cursor: { line: 0, col: 0 } }
}

export function moveToFileEnd(doc: Doc): Doc {
  const last = doc.lines.length - 1
  return { ...doc, cursor: { line: last, col: doc.lines[last].length } }
}

export function deleteLine(doc: Doc, sel: Selection | null): Doc {
  const startLine = sel && !isCollapsed(sel) ? normalizeSelection(sel)[0].line : doc.cursor.line
  const endLine = sel && !isCollapsed(sel) ? normalizeSelection(sel)[1].line : doc.cursor.line
  if (doc.lines.length === 1) return { lines: [''], cursor: { line: 0, col: 0 } }
  const newLines = [...doc.lines.slice(0, startLine), ...doc.lines.slice(endLine + 1)]
  const newLine = Math.min(startLine, newLines.length - 1)
  return { lines: newLines, cursor: { line: newLine, col: Math.min(doc.cursor.col, newLines[newLine].length) } }
}

export function moveLines(doc: Doc, sel: Selection | null, dir: 1 | -1): [Doc, Cursor | null] {
  const anchor = sel && !isCollapsed(sel) ? sel.anchor : null
  const head = doc.cursor
  const startLine = anchor ? Math.min(anchor.line, head.line) : head.line
  const endLine = anchor ? Math.max(anchor.line, head.line) : head.line
  if (dir === -1 && startLine === 0) return [doc, anchor]
  if (dir === 1 && endLine === doc.lines.length - 1) return [doc, anchor]
  const lines = [...doc.lines]
  const block = lines.splice(startLine, endLine - startLine + 1)
  lines.splice(startLine + dir, 0, ...block)
  return [
    { lines, cursor: { line: head.line + dir, col: head.col } },
    anchor ? { line: anchor.line + dir, col: anchor.col } : null,
  ]
}

export function copyLines(doc: Doc, sel: Selection | null, dir: 1 | -1): [Doc, Cursor | null] {
  const anchor = sel && !isCollapsed(sel) ? sel.anchor : null
  const head = doc.cursor
  const startLine = anchor ? Math.min(anchor.line, head.line) : head.line
  const endLine = anchor ? Math.max(anchor.line, head.line) : head.line
  const blockSize = endLine - startLine + 1
  const lines = [...doc.lines]
  const block = lines.slice(startLine, endLine + 1)
  if (dir === -1) lines.splice(startLine, 0, ...block)
  else lines.splice(endLine + 1, 0, ...block)
  return [
    { lines, cursor: { line: head.line + blockSize, col: head.col } },
    anchor ? { line: anchor.line + blockSize, col: anchor.col } : null,
  ]
}

export function insertLineBelow(doc: Doc): Doc {
  const { lines, cursor } = doc
  const indent = lines[cursor.line].match(/^(\s*)/)?.[1] ?? ''
  const newLines = [...lines]
  newLines.splice(cursor.line + 1, 0, indent)
  return { lines: newLines, cursor: { line: cursor.line + 1, col: indent.length } }
}

export function insertLineAbove(doc: Doc): Doc {
  const { lines, cursor } = doc
  const indent = lines[cursor.line].match(/^(\s*)/)?.[1] ?? ''
  const newLines = [...lines]
  newLines.splice(cursor.line, 0, indent)
  return { lines: newLines, cursor: { line: cursor.line, col: indent.length } }
}

export function selectCurrentLine(doc: Doc): [Doc, Cursor] {
  const { lines, cursor } = doc
  const anchor: Cursor = { line: cursor.line, col: 0 }
  const head: Cursor = cursor.line < lines.length - 1
    ? { line: cursor.line + 1, col: 0 }
    : { line: cursor.line, col: lines[cursor.line].length }
  return [{ ...doc, cursor: head }, anchor]
}

export function selectWordAtCursor(doc: Doc): [Doc, Cursor] | null {
  const { lines, cursor } = doc
  const text = lines[cursor.line]
  let col = cursor.col < text.length ? cursor.col : cursor.col - 1
  if (col < 0 || !isWordChar(text[col])) return null
  let start = col
  while (start > 0 && isWordChar(text[start - 1])) start--
  let end = col + 1
  while (end < text.length && isWordChar(text[end])) end++
  return [
    { ...doc, cursor: { line: cursor.line, col: end } },
    { line: cursor.line, col: start },
  ]
}

function offsetToCursor(lines: string[], offset: number): Cursor {
  let o = Math.max(0, offset)
  for (let i = 0; i < lines.length; i++) {
    if (o <= lines[i].length) return { line: i, col: o }
    o -= lines[i].length + 1
  }
  const last = lines.length - 1
  return { line: last, col: lines[last].length }
}

export function findNextOccurrence(
  lines: string[],
  searchText: string,
  afterOffset: number,
): { anchor: Cursor; head: Cursor } | null {
  if (!searchText) return null
  const text = lines.join('\n')
  let idx = text.indexOf(searchText, afterOffset + 1)
  if (idx === -1) idx = text.indexOf(searchText, 0)
  if (idx === -1) return null
  return {
    anchor: offsetToCursor(lines, idx),
    head: offsetToCursor(lines, idx + searchText.length),
  }
}

export function findAllOccurrences(
  lines: string[],
  searchText: string,
): Array<{ anchor: Cursor; head: Cursor }> {
  if (!searchText) return []
  const text = lines.join('\n')
  const results: Array<{ anchor: Cursor; head: Cursor }> = []
  let idx = text.indexOf(searchText)
  while (idx !== -1) {
    results.push({
      anchor: offsetToCursor(lines, idx),
      head: offsetToCursor(lines, idx + searchText.length),
    })
    idx = text.indexOf(searchText, idx + searchText.length)
  }
  return results
}

export function toggleLineComment(
  doc: Doc,
  sel: Selection | null,
  commentStr: string,
): [Doc, Cursor | null] {
  if (!commentStr) return [doc, sel && !isCollapsed(sel) ? sel.anchor : null]
  const anchor = sel && !isCollapsed(sel) ? sel.anchor : null
  const startLine = anchor ? Math.min(anchor.line, doc.cursor.line) : doc.cursor.line
  const endLine = anchor ? Math.max(anchor.line, doc.cursor.line) : doc.cursor.line
  const lines = doc.lines
  const nonEmpty = lines.slice(startLine, endLine + 1).filter(l => l.trim().length > 0)
  const allCommented = nonEmpty.length > 0 && nonEmpty.every(l => l.trimStart().startsWith(commentStr))
  const newLines = [...lines]
  for (let i = startLine; i <= endLine; i++) {
    const line = newLines[i]
    if (line.trim().length === 0) continue
    const trimmed = line.trimStart()
    const indent = line.slice(0, line.length - trimmed.length)
    if (allCommented) {
      newLines[i] = indent + (trimmed.startsWith(commentStr + ' ')
        ? trimmed.slice(commentStr.length + 1)
        : trimmed.slice(commentStr.length))
    } else {
      newLines[i] = indent + commentStr + ' ' + trimmed
    }
  }
  return [{ ...doc, lines: newLines }, anchor]
}
