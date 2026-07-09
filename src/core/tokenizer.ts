import { createHighlighter, type Highlighter, type GrammarState, type ThemedToken } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { BundledLanguage } from 'shiki'
import type { TokenizedLine } from './renderer'

const THEME = 'dark-plus'
const DEFAULT_FG = '#d4d4d4'

let _hlPromise: Promise<Highlighter> | null = null
const loadedLangs = new Set<string>()

const jsEngine = createJavaScriptRegexEngine()

function getHighlighter(): Promise<Highlighter> {
  if (!_hlPromise) {
    _hlPromise = createHighlighter({ themes: [THEME], langs: [], engine: jsEngine })
  }
  return _hlPromise
}

async function ensureLang(hl: Highlighter, lang: string): Promise<boolean> {
  if (loadedLangs.has(lang)) return true
  try {
    await hl.loadLanguage(lang as unknown as BundledLanguage)
    loadedLangs.add(lang)
    return true
  } catch {
    return false
  }
}

function toTokenizedLine(line: ThemedToken[]): TokenizedLine {
  return line.map(t => ({ text: t.content, color: t.color ?? DEFAULT_FG }))
}

export class IncrementalTokenizer {
  private hl: Highlighter | null = null
  private lang: string = ''
  private lineEndStates: (GrammarState | null)[] = []
  tokenLines: TokenizedLine[] = []

  async setLang(lang: string): Promise<void> {
    const hl = await getHighlighter()
    const ok = await ensureLang(hl, lang)
    if (!ok) return
    this.hl = hl
    this.lang = lang
    this.lineEndStates = []
    this.tokenLines = []
  }

  // Tokenize lines starting from fromLine.
  // Stops early when the grammar state converges with the cached state.
  // Returns true if any tokenLines were updated.
  tokenizeFrom(lines: string[], fromLine: number): boolean {
    const hl = this.hl
    if (!hl || !this.lang) return false

    // Resize arrays to match current line count
    const len = lines.length
    if (this.tokenLines.length !== len) {
      this.tokenLines.length = len
      this.lineEndStates.length = len
    }

    let state: GrammarState | null = fromLine > 0 ? (this.lineEndStates[fromLine - 1] ?? null) : null
    let changed = false

    for (let i = fromLine; i < len; i++) {
      const tokens = hl.codeToTokensBase(lines[i], {
        lang: this.lang as unknown as BundledLanguage,
        theme: THEME,
        grammarState: state ?? undefined,
      })

      const newTokenLine = toTokenizedLine(tokens[0] ?? [])
      const newState = hl.getLastGrammarState(tokens) ?? null

      this.tokenLines[i] = newTokenLine
      changed = true

      const oldState = this.lineEndStates[i]
      this.lineEndStates[i] = newState
      state = newState

      // Stop when grammar state converges (lines beyond are unaffected)
      if (i > fromLine && oldState && newState) {
        const oldStack = oldState.getInternalStack()
        const newStack = newState.getInternalStack()
        if (oldStack && newStack && (oldStack as any).equals(newStack)) break
      }
    }

    return changed
  }

  // Find first line that differs between old and new lines arrays
  static firstChangedLine(oldLines: string[], newLines: string[]): number {
    const len = Math.min(oldLines.length, newLines.length)
    for (let i = 0; i < len; i++) {
      if (oldLines[i] !== newLines[i]) return i
    }
    return len
  }

  // Adjust state array when lines are inserted or deleted at a position
  adjustForLineDelta(atLine: number, delta: number): void {
    if (delta > 0) {
      this.lineEndStates.splice(atLine, 0, ...new Array(delta).fill(null))
      this.tokenLines.splice(atLine, 0, ...new Array(delta).fill([]))
    } else if (delta < 0) {
      this.lineEndStates.splice(atLine, -delta)
      this.tokenLines.splice(atLine, -delta)
    }
  }
}

/** Map file extension → Shiki language id */
export function extToLang(ext: string): string | undefined {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', cs: 'csharp',
    java: 'java', kt: 'kotlin', swift: 'swift', rb: 'ruby', php: 'php',
    lua: 'lua', r: 'r', dart: 'dart', scala: 'scala',
    css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', xml: 'xml', vue: 'vue', svelte: 'svelte',
    json: 'json', jsonc: 'jsonc', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', mdx: 'mdx',
    sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'fish',
    sql: 'sql', graphql: 'graphql',
  }
  return map[ext.toLowerCase()]
}
