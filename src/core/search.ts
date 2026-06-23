import type { Cursor } from './document'

export interface SearchState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  matchCount: number
  currentIndex: number  // 0-based; -1 when no matches or query empty
  isOpen: boolean
  regexError: string | null
}

export interface SearchActions {
  setQuery(q: string): void
  next(): void
  prev(): void
  close(): void
  setCaseSensitive(v: boolean): void
  setWholeWord(v: boolean): void
  setUseRegex(v: boolean): void
}

export type SearchMatch = { anchor: Cursor; head: Cursor }

export const INITIAL_SEARCH_STATE: SearchState = {
  query: '',
  caseSensitive: false,
  wholeWord: false,
  useRegex: false,
  matchCount: 0,
  currentIndex: -1,
  isOpen: false,
  regexError: null,
}

export function searchLines(
  lines: string[],
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegex: boolean,
): { matches: SearchMatch[]; regexError: string | null } {
  if (!query) return { matches: [], regexError: null }

  let pattern: RegExp
  try {
    const flags = caseSensitive ? 'g' : 'gi'
    if (useRegex) {
      const src = wholeWord ? `(?<![\\w])(?:${query})(?![\\w])` : query
      pattern = new RegExp(src, flags)
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const src = wholeWord ? `\\b${escaped}\\b` : escaped
      pattern = new RegExp(src, flags)
    }
  } catch (e) {
    return { matches: [], regexError: (e as Error).message }
  }

  const text = lines.join('\n')
  const results: SearchMatch[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m[0].length === 0) { pattern.lastIndex++; continue }
    results.push({
      anchor: offsetToCursor(lines, m.index),
      head: offsetToCursor(lines, m.index + m[0].length),
    })
  }
  return { matches: results, regexError: null }
}

function offsetToCursor(lines: string[], offset: number): Cursor {
  let rem = offset
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length + 1  // +1 for '\n'
    if (rem < len) return { line: i, col: rem }
    rem -= len
  }
  const last = lines.length - 1
  return { line: last, col: lines[last]?.length ?? 0 }
}
