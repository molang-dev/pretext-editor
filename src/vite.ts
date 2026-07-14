import type { Plugin, ResolvedConfig } from 'vite'
import { cpSync, mkdirSync, readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const libDir = dirname(fileURLToPath(import.meta.url))
const WORKER_IMPL_ID = '#worker-impl'
const WORKER_IMPL_BUNDLE_RESOLVED = '\0__pretext_worker_bundle__'

export function pretextEditorPlugin(): Plugin {
  const pkgRoot = resolve(libDir, '..')
  let outAssets = 'dist/assets'
  return {
    name: 'pretext-editor',
    config(config) {
      config.define = { __DEV__: 'false', ...config.define }
      config.server ??= {}
      config.server.fs ??= {}
      config.server.fs.allow = [...(config.server.fs.allow ?? []), pkgRoot]
      config.optimizeDeps ??= {}
      config.optimizeDeps.exclude = [...(config.optimizeDeps.exclude ?? []), 'pretext-editor']
      config.worker ??= {}
      config.worker.format ??= 'es'
    },
    resolveId(id) {
      if (id === WORKER_IMPL_ID) return resolve(libDir, 'worker-split.js')
    },
    configResolved(config: ResolvedConfig) {
      outAssets = resolve(config.root, config.build.outDir, config.build.assetsDir)
    },
    closeBundle() {
      mkdirSync(outAssets, { recursive: true })
      cpSync(resolve(libDir, 'onig.wasm'), resolve(outAssets, 'onig.wasm'))
    },
  }
}

export function pretextEditorBundlePlugin(): Plugin {
  return {
    name: 'pretext-editor-bundle',
    resolveId(id) {
      if (id === WORKER_IMPL_ID) return WORKER_IMPL_BUNDLE_RESOLVED
    },
    load(id) {
      if (id === WORKER_IMPL_BUNDLE_RESOLVED) {
        const code = readFileSync(resolve(libDir, 'highlight.worker.bundle.js'), 'utf-8')
        return `
const _c = ${JSON.stringify(code)}
function _mk() {
  return new Worker(URL.createObjectURL(new Blob([_c], { type: 'application/javascript' })), { type: 'module' })
}
export function createWorker() { return _mk() }
export function createEagerWorker() {
  if (typeof Worker === 'undefined') return null
  try { return _mk() } catch { return null }
}
`
      }
    },
  }
}
