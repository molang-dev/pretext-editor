import { loadWASM, createOnigScanner, createOnigString } from 'vscode-oniguruma'
import { Registry, INITIAL, type IRawGrammar, type StateStack } from 'vscode-textmate'
import type { TokenizedLine } from '../core/renderer'

// ---- Grammar data (all bundled inline) ----
import typescript from '../grammars/typescript.json'
import tsx from '../grammars/tsx.json'
import javascript from '../grammars/javascript.json'
import jsx from '../grammars/jsx.json'
import python from '../grammars/python.json'
import rust from '../grammars/rust.json'
import go from '../grammars/go.json'
import c from '../grammars/c.json'
import regexp from '../grammars/regexp.json'
import glsl from '../grammars/glsl.json'
import sql from '../grammars/sql.json'
import cpp_macro from '../grammars/cpp-macro.json'
import cpp from '../grammars/cpp.json'
import csharp from '../grammars/csharp.json'
import java from '../grammars/java.json'
import kotlin from '../grammars/kotlin.json'
import swift from '../grammars/swift.json'
import css from '../grammars/css.json'
import html from '../grammars/html.json'
import haml from '../grammars/haml.json'
import xml from '../grammars/xml.json'
import graphql from '../grammars/graphql.json'
import shellscript from '../grammars/shellscript.json'
import lua from '../grammars/lua.json'
import yaml from '../grammars/yaml.json'
import ruby from '../grammars/ruby.json'
import json from '../grammars/json.json'
import php from '../grammars/php.json'
import r from '../grammars/r.json'
import dart from '../grammars/dart.json'
import scala from '../grammars/scala.json'
import scss from '../grammars/scss.json'
import less from '../grammars/less.json'
import html_derivative from '../grammars/html-derivative.json'
import markdown_vue from '../grammars/markdown-vue.json'
import vue_directives from '../grammars/vue-directives.json'
import vue_interpolations from '../grammars/vue-interpolations.json'
import vue_sfc from '../grammars/vue-sfc-style-variable-injection.json'
import vue from '../grammars/vue.json'
import postcss from '../grammars/postcss.json'
import svelte from '../grammars/svelte.json'
import jsonc from '../grammars/jsonc.json'
import toml from '../grammars/toml.json'
import markdown from '../grammars/markdown.json'
import fish from '../grammars/fish.json'
import darkPlusRaw from '../themes/dark-plus.json'
import draculaRaw from '../themes/dracula.json'
import githubLightRaw from '../themes/github-light.json'
import grammarIndex from '../grammars/index.json'

const GRAMMAR_BY_SCOPE: Record<string, unknown> = {
  'source.ts': typescript,
  'source.tsx': tsx,
  'source.js': javascript,
  'source.js.jsx': jsx,
  'source.python': python,
  'source.rust': rust,
  'source.go': go,
  'source.c': c,
  'source.regexp.python': regexp,
  'source.glsl': glsl,
  'source.sql': sql,
  'source.cpp.embedded.macro': cpp_macro,
  'source.cpp': cpp,
  'source.cs': csharp,
  'source.java': java,
  'source.kotlin': kotlin,
  'source.swift': swift,
  'source.css': css,
  'text.html.basic': html,
  'text.haml': haml,
  'text.xml': xml,
  'source.graphql': graphql,
  'source.shell': shellscript,
  'source.lua': lua,
  'source.yaml': yaml,
  'source.ruby': ruby,
  'source.json': json,
  'source.php': php,
  'source.r': r,
  'source.dart': dart,
  'source.scala': scala,
  'source.css.scss': scss,
  'source.css.less': less,
  'text.html.derivative': html_derivative,
  'markdown.vue.codeblock': markdown_vue,
  'vue.directives': vue_directives,
  'vue.interpolations': vue_interpolations,
  'vue.sfc.style.variable.injection': vue_sfc,
  'text.html.vue': vue,
  'source.css.postcss': postcss,
  'source.svelte': svelte,
  'source.json.comments': jsonc,
  'source.toml': toml,
  'text.html.markdown': markdown,
  'source.fish': fish,
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
    loadGrammar: async (scope: string) => (GRAMMAR_BY_SCOPE[scope] ?? null) as IRawGrammar | null,
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
      // Slice to actual count tokenized
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
    const size = bi < BATCH_SIZES.length ? BATCH_SIZES[bi++] : 2000
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
