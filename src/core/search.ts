import type { Cursor } from './document'

export interface SearchState {
  query: string
  caseSensitive: boolean
  matchCount: number
  currentIndex: number  // 0-based; -1 when no matches or query empty
  isOpen: boolean
}

export interface SearchActions {
  setQuery(q: string): void
  next(): void
  prev(): void
  close(): void
  setCaseSensitive(v: boolean): void
}

export type SearchMatch = { anchor: Cursor; head: Cursor }

export const INITIAL_SEARCH_STATE: SearchState = {
  query: '',
  caseSensitive: false,
  matchCount: 0,
  currentIndex: -1,
  isOpen: false,
}

export function searchLines(
  lines: string[],
  query: string,
  caseSensitive: boolean,
): SearchMatch[] {
  if (!query) return []
  const text = lines.join('\n')
  const needle = caseSensitive ? query : query.toLowerCase()
  const haystack = caseSensitive ? text : text.toLowerCase()
  const results: SearchMatch[] = []
  let idx = haystack.indexOf(needle)
  while (idx !== -1) {
    results.push({
      anchor: offsetToCursor(lines, idx),
      head: offsetToCursor(lines, idx + query.length),
    })
    idx = haystack.indexOf(needle, idx + 1)
  }
  return results
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
