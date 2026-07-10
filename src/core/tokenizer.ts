import type { TokenizedLine } from './renderer'

export type TokenBatchCallback = (from: number, to: number, tokenLines: TokenizedLine[]) => void

export class WorkerTokenizer {
  private worker: Worker | null = null
  private batchCallback: TokenBatchCallback | null = null
  private currentReqId = 0
  private langReadyCallback: (() => void) | null = null

  init(workerUrl?: URL | string): void {
    if (typeof Worker === 'undefined') return
    try {
      // Default path is correct when tokenizer code lives in dist/index.js (root level).
      // Framework wrappers (vue/react) must pass their own URL since they are one level deeper.
      const url = workerUrl ?? new URL('./highlight.worker.js', import.meta.url)
      this.worker = new Worker(url, { type: 'module' })
      this.worker.onmessage = (e: MessageEvent) => this.onMessage(e.data)
    } catch {
      // Worker not available (e.g., Node.js CJS context)
    }
  }

  private onMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'langReady') {
      this.langReadyCallback?.()
      this.langReadyCallback = null
    } else if (msg.type === 'batch' && msg.reqId === this.currentReqId && this.batchCallback) {
      this.batchCallback(msg.from as number, msg.to as number, msg.tokenLines as TokenizedLine[])
    }
  }

  setLang(lang: string, onReady: () => void): void {
    this.langReadyCallback = onReady
    this.worker?.postMessage({ type: 'setLang', lang })
  }

  setTheme(themeName: string): void {
    this.worker?.postMessage({ type: 'setTheme', themeName })
  }

  update(
    fromLine: number,
    removedCount: number,
    addedLines: string[],
    onBatch: TokenBatchCallback,
    visibleTo?: number,
  ): void {
    const reqId = ++this.currentReqId
    this.batchCallback = onBatch
    this.worker?.postMessage({ type: 'update', reqId, fromLine, removedCount, addedLines, visibleTo })
  }

  destroy(): void {
    this.worker?.terminate()
    this.worker = null
  }
}

export function firstChangedLine(oldLines: string[], newLines: string[]): number {
  const len = Math.min(oldLines.length, newLines.length)
  for (let i = 0; i < len; i++) {
    if (oldLines[i] !== newLines[i]) return i
  }
  return len
}

export function computeLineDelta(
  oldLines: string[],
  newLines: string[],
  fromLine: number,
): { removedCount: number; addedLines: string[] } {
  let oldEnd = oldLines.length
  let newEnd = newLines.length
  while (oldEnd > fromLine && newEnd > fromLine && oldLines[oldEnd - 1] === newLines[newEnd - 1]) {
    oldEnd--
    newEnd--
  }
  return { removedCount: oldEnd - fromLine, addedLines: newLines.slice(fromLine, newEnd) }
}

/** Map file extension → language id */
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
    md: 'markdown', mdx: 'markdown',
    sh: 'shellscript', bash: 'shellscript', zsh: 'shellscript', fish: 'fish',
    sql: 'sql', graphql: 'graphql',
  }
  return map[ext.toLowerCase()]
}
