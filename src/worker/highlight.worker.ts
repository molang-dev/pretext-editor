import { log } from '@molang/alogjs'
import { loadWASM, createOnigScanner, createOnigString } from 'vscode-oniguruma'

declare const __DEV__: boolean
declare const __WASM_BASE64__: string | undefined
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
  let wasmBuf: ArrayBuffer
  if (typeof __WASM_BASE64__ !== 'undefined') {
    const bin = atob(__WASM_BASE64__)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    wasmBuf = bytes.buffer
  } else {
    wasmBuf = await fetch(new URL('./onig.wasm', import.meta.url)).then(r => r.arrayBuffer())
  }
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
    const res = grammar.tokenizeLine2(lines[i], stack, 500)
    if (res.stoppedEarly) {
      tokenLines[i] = []
      lineEndStacks[i] = null
      result.push([])
      continue
    }
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

// Tokenize a range using INITIAL state (approximate). Does NOT update lineEndStacks,
// so the sequential pass can still correct with the true state later.
function tokenizeRangePreview(from: number, to: number): TokenizedLine[] {
  if (!grammar) return []
  let stack: StateStack = INITIAL
  const result: TokenizedLine[] = []
  for (let i = from; i < to && i < lines.length; i++) {
    const res = grammar.tokenizeLine2(lines[i], stack, 500)
    if (res.stoppedEarly) {
      tokenLines[i] = []
      result.push([])
      continue
    }
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
    stack = res.ruleStack
    tokenLines[i] = tl
    result.push(tl)
  }
  return result
}

const BATCH_SIZES = [200, 400, 800, 1600]
let latestPriorityEnd = 0
let currentFromLine = 0

async function tokenizeBatches(reqId: number, fromLine: number, visFrom: number, visTo: number): Promise<void> {
  latestPriorityEnd = 0
  let from = fromLine
  if (__DEV__) log.D('hl', 'tokenizeBatches reqId=%v fromLine=%v visibleTo=%v totalLines=%v', reqId, fromLine, visTo, lines.length)

  // Phase 1: priority pass — visible viewport + one viewport height of buffer below
  const prefetch = Math.max(0, visTo - visFrom)
  const phase1End = Math.min(lines.length, visTo + prefetch)
  if (phase1End > from) {
    if (currentReqId !== reqId) return
    if (__DEV__) log.D('hl', 'phase1 start from=%v to=%v', from, phase1End)
    const result = tokenizeRange(from, phase1End)
    const actualTo = from + result.length
    if (__DEV__) log.D('hl', 'phase1 done actualTo=%v', actualTo)
    if (currentReqId !== reqId) return
    self.postMessage({ type: 'batch', reqId, from, to: actualTo, tokenLines: result })
    if (result.length < phase1End - from) return
    from = phase1End
    await new Promise<void>(r => setTimeout(r, 0))
  }

  // Phase 2: background fill — with viewport catch-up if user scrolls into unprocessed territory
  let bi = 0
  while (from < lines.length) {
    if (currentReqId !== reqId) return

    const pEnd = latestPriorityEnd
    if (pEnd > from) {
      // User scrolled ahead — advance toward priority end one batch at a time so
      // viewport messages are processed between batches.
      const size = BATCH_SIZES[Math.min(bi++, BATCH_SIZES.length - 1)]
      const to = Math.min(from + size, pEnd, lines.length)
      const result = tokenizeRange(from, to)
      const actualTo = from + result.length
      if (currentReqId !== reqId) return
      if (__DEV__) log.D('hl', 'phase2 batch from=%v to=%v', from, actualTo)
      self.postMessage({ type: 'batch', reqId, from, to: actualTo, tokenLines: result })
      if (result.length < to - from) break
      from = actualTo
      await new Promise<void>(r => setTimeout(r, 0))
      continue
    }

    // Normal progressive batch
    const size = BATCH_SIZES[Math.min(bi++, BATCH_SIZES.length - 1)]
    const to = Math.min(from + size, lines.length)
    const result = tokenizeRange(from, to)
    const actualTo = from + result.length
    if (currentReqId !== reqId) return
    if (__DEV__) log.D('hl', 'phase2 batch from=%v to=%v', from, actualTo)
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
    currentFromLine = msg.fromLine as number
    applyEdit(msg.fromLine as number, msg.removedCount as number, msg.addedLines as string[])
    currentReqId = msg.reqId as number
    tokenizeBatches(
      currentReqId,
      msg.fromLine as number,
      (msg.visibleFrom as number | undefined) ?? 0,
      (msg.visibleTo as number | undefined) ?? 0,
    )
  } else if (msg.type === 'viewport') {
    const visFrom = msg.visFrom as number
    const visTo = msg.visTo as number
    const pEnd = visTo + Math.max(0, visTo - visFrom)
    if (pEnd > latestPriorityEnd) latestPriorityEnd = pEnd
    // Immediate approximate preview covering 3N lines (N above + N visible + N below).
    // Only fires when the sequential pass hasn't yet reached previewFrom.
    // currentFromLine prevents overwriting correctly-tokenized lines above the edit.
    const N = visTo - visFrom
    const previewFrom = Math.max(currentFromLine, Math.max(0, visFrom - N))
    const previewTo = Math.min(lines.length, visTo + N)
    // Find first line in range not yet sequentially tokenized, preview from there.
    let previewStart = previewFrom
    while (previewStart < previewTo && lineEndStacks[previewStart] !== null) previewStart++
    if (previewStart < previewTo) {
      const result = tokenizeRangePreview(previewStart, previewTo)
      if (result.length > 0) {
        self.postMessage({ type: 'batch', reqId: currentReqId, from: previewStart, to: previewStart + result.length, tokenLines: result })
      }
    }
  }
}

initWasm().then(() => {
  wasmReady = true
  for (const msg of pendingMsgs) dispatch(msg)
  pendingMsgs.length = 0
}).catch((e: unknown) => {
  self.postMessage({ type: 'error', message: String(e) })
})
