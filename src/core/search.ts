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
  showReplace: boolean
  replaceQuery: string
  preserveCase: boolean
}

export interface SearchActions {
  setQuery(q: string): void
  next(): void
  prev(): void
  close(): void
  setCaseSensitive(v: boolean): void
  setWholeWord(v: boolean): void
  setUseRegex(v: boolean): void
  setPreserveCase(v: boolean): void
  toggleReplace(): void
  setReplaceQuery(q: string): void
  replace(): void
  replaceAll(): void
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
  showReplace: false,
  replaceQuery: '',
  preserveCase: false,
}

/**
 * Applies the case pattern of `matched` to `replacement`.
 * Rules mirror VSCode: ALL CAPS → upper, all lower → lower,
 * Title case → title, mixed (camel/pascal/etc.) → unchanged.
 */
export function applyPreserveCase(matched: string, replacement: string): string {
  if (!matched || !replacement) return replacement
  const hasUpper = matched !== matched.toLowerCase()
  const hasLower = matched !== matched.toUpperCase()
  if (hasUpper && !hasLower) return replacement.toUpperCase()
  if (!hasUpper && hasLower) return replacement.toLowerCase()
  // Title case: first char upper, rest lower
  if (matched[0] === matched[0].toUpperCase() && matched.slice(1) === matched.slice(1).toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1).toLowerCase()
  }
  return replacement
}

/** Build a search RegExp from query options. Returns null pattern on empty query. */
export function buildSearchRegex(
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegex: boolean,
): { pattern: RegExp | null; regexError: string | null } {
  if (!query) return { pattern: null, regexError: null }
  try {
    const flags = caseSensitive ? 'g' : 'gi'
    let src: string
    if (useRegex) {
      src = wholeWord ? `(?<![\\w])(?:${query})(?![\\w])` : query
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      src = wholeWord ? `\\b${escaped}\\b` : escaped
    }
    return { pattern: new RegExp(src, flags), regexError: null }
  } catch (e) {
    return { pattern: null, regexError: (e as Error).message }
  }
}

/** Precompute the character offset of each line's start (including the '\n' separator). */
export function buildLineOffsets(lines: string[]): number[] {
  const offsets = new Array<number>(lines.length)
  offsets[0] = 0
  for (let i = 1; i < lines.length; i++) {
    offsets[i] = offsets[i - 1] + lines[i - 1].length + 1
  }
  return offsets
}

/** Binary-search version of offsetToCursor — O(log n) instead of O(n). */
export function fastOffsetToCursor(lineOffsets: number[], lines: string[], offset: number): Cursor {
  let lo = 0, hi = lineOffsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineOffsets[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return { line: lo, col: offset - lineOffsets[lo] }
}

export function searchLines(
  lines: string[],
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
  useRegex: boolean,
): { matches: SearchMatch[]; regexError: string | null } {
  const { pattern, regexError } = buildSearchRegex(query, caseSensitive, wholeWord, useRegex)
  if (regexError) return { matches: [], regexError }
  if (!pattern) return { matches: [], regexError: null }

  const text = lines.join('\n')
  const lineOffsets = buildLineOffsets(lines)
  const results: SearchMatch[] = []
  let m: RegExpExecArray | null
  while ((m = pattern.exec(text)) !== null) {
    if (m[0].length === 0) { pattern.lastIndex++; continue }
    results.push({
      anchor: fastOffsetToCursor(lineOffsets, lines, m.index),
      head: fastOffsetToCursor(lineOffsets, lines, m.index + m[0].length),
    })
  }
  return { matches: results, regexError: null }
}
