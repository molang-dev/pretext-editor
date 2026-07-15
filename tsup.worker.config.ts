import { defineConfig } from 'tsup'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'

export default defineConfig({
  define: {
    __DEV__: 'false',
    __WASM_BASE64__: JSON.stringify(
      readFileSync('node_modules/vscode-oniguruma/release/onig.wasm').toString('base64'),
    ),
  },
  entry: { 'highlight.worker.bundle': 'src/worker/highlight.worker.ts' },
  format: ['esm'],
  dts: false,
  splitting: false,
  clean: true,
  noExternal: ['vscode-textmate', 'vscode-oniguruma'],
  onSuccess: async () => {
    mkdirSync('dist/core', { recursive: true })
    writeFileSync('dist/core/worker-create.js', `\
function mk() {
  return new Worker(new URL('../highlight.worker.bundle.js', import.meta.url), { type: 'module' })
}
export function createWorker() { return mk() }
export function createEagerWorker() {
  if (typeof Worker === 'undefined') return null
  try { return mk() } catch { return null }
}
`)
    writeFileSync('dist/core/worker-create.d.ts', `\
export declare function createWorker(): Worker
export declare function createEagerWorker(): Worker | null
`)
  },
})
