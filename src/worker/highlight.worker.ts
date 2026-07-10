import { loadWASM, createOnigScanner, createOnigString } from 'vscode-oniguruma'
import { Registry, INITIAL, type IRawGrammar, type StateStack } from 'vscode-textmate'
import type { TokenizedLine } from '../core/renderer'

// ---- Themes (small, always needed, stay inline) ----
import darkPlusRaw from '../themes/dark-plus.json'
import draculaRaw from '../themes/dracula.json'
import githubLightRaw from '../themes/github-light.json'
import grammarIndex from '../grammars/index.json'

// ---- Grammar lazy-loaders (dynamic import → separate chunks, fetched on demand) ----
const GRAMMAR_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  'source.ts':                              () => import('../grammars/typescript.json'),
  'source.tsx':                             () => import('../grammars/tsx.json'),
  'source.js':                              () => import('../grammars/javascript.json'),
  'source.js.jsx':                          () => import('../grammars/jsx.json'),
  'source.python':                          () => import('../grammars/python.json'),
  'source.rust':                            () => import('../grammars/rust.json'),
  'source.go':                              () => import('../grammars/go.json'),
  'source.c':                               () => import('../grammars/c.json'),
  'source.regexp.python':                   () => import('../grammars/regexp.json'),
  'source.glsl':                            () => import('../grammars/glsl.json'),
  'source.sql':                             () => import('../grammars/sql.json'),
  'source.cpp.embedded.macro':              () => import('../grammars/cpp-macro.json'),
  'source.cpp':                             () => import('../grammars/cpp.json'),
  'source.cs':                              () => import('../grammars/csharp.json'),
  'source.java':                            () => import('../grammars/java.json'),
  'source.kotlin':                          () => import('../grammars/kotlin.json'),
  'source.swift':                           () => import('../grammars/swift.json'),
  'source.css':                             () => import('../grammars/css.json'),
  'text.html.basic':                        () => import('../grammars/html.json'),
  'text.haml':                              () => import('../grammars/haml.json'),
  'text.xml':                               () => import('../grammars/xml.json'),
  'source.graphql':                         () => import('../grammars/graphql.json'),
  'source.shell':                           () => import('../grammars/shellscript.json'),
  'source.lua':                             () => import('../grammars/lua.json'),
  'source.yaml':                            () => import('../grammars/yaml.json'),
  'source.ruby':                            () => import('../grammars/ruby.json'),
  'source.json':                            () => import('../grammars/json.json'),
  'source.php':                             () => import('../grammars/php.json'),
  'source.r':                               () => import('../grammars/r.json'),
  'source.dart':                            () => import('../grammars/dart.json'),
  'source.scala':                           () => import('../grammars/scala.json'),
  'source.css.scss':                        () => import('../grammars/scss.json'),
  'source.css.less':                        () => import('../grammars/less.json'),
  'text.html.derivative':                   () => import('../grammars/html-derivative.json'),
  'markdown.vue.codeblock':                 () => import('../grammars/markdown-vue.json'),
  'vue.directives':                         () => import('../grammars/vue-directives.json'),
  'vue.interpolations':                     () => import('../grammars/vue-interpolations.json'),
  'vue.sfc.style.variable.injection':       () => import('../grammars/vue-sfc-style-variable-injection.json'),
  'text.html.vue':                          () => import('../grammars/vue.json'),
  'source.css.postcss':                     () => import('../grammars/postcss.json'),
  'source.svelte':                          () => import('../grammars/svelte.json'),
  'source.json.comments':                   () => import('../grammars/jsonc.json'),
  'source.toml':                            () => import('../grammars/toml.json'),
  'text.html.markdown':                     () => import('../grammars/markdown.json'),
  'source.fish':                            () => import('../grammars/fish.json'),
}

const LANG_ALIASES: Record<string, string> = {
  bash: 'shellscript',
  sh: 'shellscript',
  zsh: 'shellscript',
  mdx: 'markdown',
}

// vscode-textmate expects settings[] not tokenColors[]
function toVtmTheme(raw: { name?: string; tokenColors: unknown[]; colors?: Record<string, string> }) {
  const fg = raw.colors?.['editor.foreground'] ?? '#D4D4D4'
  const bg = raw.colors?.['editor.background'] ?? '#1E1E1E'
  return { name: raw.name, settings: [{ settings: { foreground: fg, background: bg } }, ...raw.tokenColors] }
}

const VTM_THEMES: Record<string, { theme: unknown; defaultFg: string }> = {
  'dark-plus':    { theme: toVtmTheme(darkPlusRaw as any),    defaultFg: '#D4D4D4' },
  'dracula':      { theme: toVtmTheme(draculaRaw as any),      defaultFg: '#F8F8F2' },
  'github-light': { theme: toVtmTheme(githubLightRaw as any), defaultFg: '#24292e' },
}

const FOREGROUND_MASK = 0xFF8000
const FOREGROUND_SHIFT = 15
let defaultFg = '#D4D4D4'

// ---- Worker state ----
let registry: Registry | null = null
let grammar: IGrammar | null = null
let colorMap: string[] = []
let lines: string[] = []
let lineEndStacks: (StateStack | null)[] = []
let tokenLines: TokenizedLine[] = []
let currentReqId = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IGrammar = any

async function initWasm(): Promise<void> {
  const wasmUrl = new URL('./onig.wasm', import.meta.url)
  const wasmBuf = await fetch(wasmUrl).then(r => r.arrayBuffer())
  await loadWASM({ data: wasmBuf })

  const onigLib = Promise.resolve({ createOnigScanner, createOnigString })
  registry = new Registry({
    onigLib,
    theme: VTM_THEMES['dark-plus'].theme as never,
    loadGrammar: async (scope: string) => {
      const loader = GRAMMAR_LOADERS[scope]
      if (!loader) return null
      const mod = await loader()
      return (mod.default ?? mod) as IRawGrammar
    },
  })
  colorMap = registry.getColorMap()
}

function handleSetTheme(themeName: string): void {
  const entry = VTM_THEMES[themeName]
  if (!registry || !entry) return
  registry.setTheme(entry.theme as never)
  colorMap = registry.getColorMap()
  defaultFg = entry.defaultFg
}

async function handleSetLang(lang: string): Promise<void> {
  if (!registry) return
  const resolved = LANG_ALIASES[lang] ?? lang
  const info = (grammarIndex as Record<string, { scopeName: string }>)[resolved]
  if (!info) return
  grammar = await registry.loadGrammar(info.scopeName)
  colorMap = registry.getColorMap()
  self.postMessage({ type: 'langReady', colorMap })
}

function applyEdit(fromLine: number, removedCount: number, addedLines: string[]): void {
  lines.splice(fromLine, removedCount, ...addedLines)
  lineEndStacks.splice(fromLine, removedCount, ...new Array(addedLines.length).fill(null))
  tokenLines.splice(fromLine, removedCount, ...new Array(addedLines.length).fill([]))
}

function tokenizeRange(from: number, to: number): TokenizedLine[] {
  if (!grammar) return []
  let stack: StateStack = from > 0 ? (lineEndStacks[from - 1] ?? INITIAL) : INITIAL
  const result: TokenizedLine[] = []

  for (let i = from; i < to && i < lines.length; i++) {
    const res = grammar.tokenizeLine2(lines[i], stack)
    const raw = res.tokens
    const n = raw.length / 2
    const tl: TokenizedLine = []

    for (let j = 0; j < n; j++) {
      const start = raw[2 * j]
      const end = j + 1 < n ? raw[2 * j + 2] : lines[i].length
      if (start >= end) continue
      const fgIdx = (raw[2 * j + 1] & FOREGROUND_MASK) >>> FOREGROUND_SHIFT
      tl.push({ text: lines[i].slice(start, end), color: colorMap[fgIdx] ?? defaultFg })
    }

    const newStack = res.ruleStack
    const oldStack = lineEndStacks[i]
    tokenLines[i] = tl
    lineEndStacks[i] = newStack
    stack = newStack
    result.push(tl)

    // Incremental: if state unchanged after the edit range, stop early
    if (i > from && oldStack && newStack.equals(oldStack)) {
      return result
    }
  }

  return result
}

const BATCH_SIZES = [200, 400, 800, 1600]

async function tokenizeBatches(reqId: number, fromLine: number, visibleTo: number): Promise<void> {
  let from = fromLine

  // Phase 1: priority pass — tokenize from fromLine to visibleTo in one shot
  // so the visible viewport is highlighted before the rest of the file.
  if (visibleTo > from) {
    if (currentReqId !== reqId) return
    const result = tokenizeRange(from, visibleTo)
    const actualTo = from + result.length
    if (currentReqId !== reqId) return
    self.postMessage({ type: 'batch', reqId, from, to: actualTo, tokenLines: result })
    if (result.length < visibleTo - from) return // incremental early-exit
    from = visibleTo
    await new Promise<void>(r => setTimeout(r, 0))
  }

  // Phase 2: background fill — remaining lines in progressive batches
  let bi = 0
  while (from < lines.length) {
    if (currentReqId !== reqId) return
    const size = BATCH_SIZES[Math.min(bi++, BATCH_SIZES.length - 1)]
    const to = Math.min(from + size, lines.length)
    const result = tokenizeRange(from, to)
    const actualTo = from + result.length
    if (currentReqId !== reqId) return
    self.postMessage({ type: 'batch', reqId, from, to: actualTo, tokenLines: result })
    if (result.length < to - from) break
    from = to
    if (from < lines.length) {
      await new Promise<void>(r => setTimeout(r, 0))
    }
  }
}

// ---- Message handling ----
let wasmReady = false
const pendingMsgs: { type: string; [k: string]: unknown }[] = []

self.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data
  if (!wasmReady) {
    pendingMsgs.push(msg)
    return
  }
  dispatch(msg)
})

function dispatch(msg: { type: string; [k: string]: unknown }): void {
  if (msg.type === 'setLang') {
    handleSetLang(msg.lang as string)
  } else if (msg.type === 'setTheme') {
    handleSetTheme(msg.themeName as string)
  } else if (msg.type === 'update') {
    applyEdit(msg.fromLine as number, msg.removedCount as number, msg.addedLines as string[])
    currentReqId = msg.reqId as number
    tokenizeBatches(currentReqId, msg.fromLine as number, (msg.visibleTo as number | undefined) ?? 0)
  }
}

initWasm().then(() => {
  wasmReady = true
  for (const msg of pendingMsgs) dispatch(msg)
  pendingMsgs.length = 0
}).catch((e: unknown) => {
  self.postMessage({ type: 'error', message: String(e) })
})
