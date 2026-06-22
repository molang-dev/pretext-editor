import { createHighlighter, type Highlighter } from 'shiki'
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
    _hlPromise = createHighlighter({
      themes: [THEME],
      langs: [],
      engine: jsEngine,
      // engine: createOnigurumaEngine(import('shiki/wasm')),
    })
  }
  return _hlPromise
}

export async function tokenize(code: string, lang: string): Promise<TokenizedLine[]> {
  const hl = await getHighlighter()
  if (!loadedLangs.has(lang)) {
    try {
      await hl.loadLanguage(lang as unknown as BundledLanguage)
      loadedLangs.add(lang)
    } catch {
      return []
    }
  }
  try {
    const result = hl.codeToTokens(code, { lang: lang as unknown as BundledLanguage, theme: THEME })
    return result.tokens.map((line) =>
      line.map((t) => ({ text: t.content, color: t.color ?? DEFAULT_FG })),
    )
  } catch {
    return []
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
