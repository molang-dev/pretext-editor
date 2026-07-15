import * as esbuild from 'esbuild'
import { mkdirSync, cpSync, realpathSync } from 'fs'

mkdirSync('dist', { recursive: true })

// Shim: intercept pretext-editor/worker-create and replace with a plain Worker URL.
// import.meta.url in node_modules is not usable in an IIFE bundle, so we hard-code the path.
const workerShimPlugin = {
  name: 'worker-create-shim',
  setup(build) {
    build.onResolve({ filter: /worker-create/ }, () => ({
      path: 'worker-create-shim', namespace: 'worker-create-shim',
    }))
    build.onLoad({ filter: /.*/, namespace: 'worker-create-shim' }, () => ({
      contents: `
export function createWorker() { return new Worker('/dist/highlight.worker.bundle.js', { type: 'module' }) }
export function createEagerWorker() {
  if (typeof Worker === 'undefined') return null
  try { return new Worker('/dist/highlight.worker.bundle.js', { type: 'module' }) } catch { return null }
}`,
      loader: 'js',
    }))
  },
}

await esbuild.build({
  entryPoints: ['src/main.cjs'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  plugins: [workerShimPlugin],
})

const pkgDist = realpathSync('node_modules/pretext-editor') + '/dist'
cpSync(`${pkgDist}/highlight.worker.bundle.js`, 'dist/highlight.worker.bundle.js')

console.log('Built dist/bundle.js')
