import { Registry, Resolver, normalizeTheme } from '@shikijs/primitive'
import { EncodedTokenMetadata, INITIAL, type IGrammar, type StateStack } from '@shikijs/vscode-textmate'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import { bundledLanguages, bundledThemes } from 'shiki'
import type { LanguageRegistration } from 'shiki'
import type { TokenizedLine } from './renderer'

const THEME = 'dark-plus'
const DEFAULT_FG = '#d4d4d4'

const jsEngine = createJavaScriptRegexEngine()

export class IncrementalTokenizer {
  private grammar: IGrammar | null = null
  private colorMap: string[] = []
  private lineEndStacks: (StateStack | null)[] = []
  tokenLines: TokenizedLine[] = []

  async setLang(lang: string): Promise<void> {
    const langGetter = bundledLanguages[lang as keyof typeof bundledLanguages]
    if (!langGetter) return

    const [langMod, themeMod] = await Promise.all([langGetter(), bundledThemes[THEME]()])
    const langs = (Array.isArray(langMod.default) ? langMod.default : [langMod.default]) as LanguageRegistration[]
    const theme = normalizeTheme(themeMod.default)

    const registry = new Registry(new Resolver(jsEngine, langs), [theme], langs)
    registry.setTheme(theme)
    this.colorMap = registry.getColorMap()
    this.grammar = (registry.getGrammar(lang) ?? null) as IGrammar | null
    this.lineEndStacks = []
    this.tokenLines = []
  }

  tokenizeFrom(lines: string[], fromLine: number): boolean {
    const grammar = this.grammar
    if (!grammar) return false

    const len = lines.length
    if (this.tokenLines.length !== len) {
      this.tokenLines.length = len
      this.lineEndStacks.length = len
    }

    let stack: StateStack = fromLine > 0 ? (this.lineEndStacks[fromLine - 1] ?? INITIAL) : INITIAL
    let changed = false

    for (let i = fromLine; i < len; i++) {
      const result = grammar.tokenizeLine2(lines[i], stack)
      const rawTokens = result.tokens
      const n = rawTokens.length / 2
      const tokenLine: TokenizedLine = []

      for (let j = 0; j < n; j++) {
        const start = rawTokens[2 * j]
        const end = j + 1 < n ? rawTokens[2 * j + 2] : lines[i].length
        if (start === end) continue
        const fg = EncodedTokenMetadata.getForeground(rawTokens[2 * j + 1])
        tokenLine.push({ text: lines[i].slice(start, end), color: this.colorMap[fg] ?? DEFAULT_FG })
      }

      this.tokenLines[i] = tokenLine
      changed = true

      const newStack = result.ruleStack
      const oldStack = this.lineEndStacks[i]
      this.lineEndStacks[i] = newStack
      stack = newStack

      if (i > fromLine && oldStack && newStack.equals(oldStack)) break
    }

    return changed
  }

  static firstChangedLine(oldLines: string[], newLines: string[]): number {
    const len = Math.min(oldLines.length, newLines.length)
    for (let i = 0; i < len; i++) {
      if (oldLines[i] !== newLines[i]) return i
    }
    return len
  }

  adjustForLineDelta(atLine: number, delta: number): void {
    if (delta > 0) {
      this.lineEndStacks.splice(atLine, 0, ...new Array(delta).fill(null))
      this.tokenLines.splice(atLine, 0, ...new Array(delta).fill([]))
    } else if (delta < 0) {
      this.lineEndStacks.splice(atLine, -delta)
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
