import * as esbuild from 'esbuild'
import { mkdirSync, cpSync, readdirSync, realpathSync } from 'fs'

mkdirSync('dist', { recursive: true })

await esbuild.build({
  entryPoints: ['src/main.cjs'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
})

// Copy worker, WASM, and grammar chunks so the browser can serve them
const pkgDist = realpathSync('node_modules/pretext-editor') + '/dist'
cpSync(`${pkgDist}/highlight.worker.js`, 'dist/highlight.worker.js')
cpSync(`${pkgDist}/onig.wasm`, 'dist/onig.wasm')
for (const f of readdirSync(pkgDist)) {
  if (f.endsWith('.js') && !f.startsWith('index') && !f.startsWith('highlight.worker') && !f.startsWith('vite'))
    cpSync(`${pkgDist}/${f}`, `dist/${f}`)
}

console.log('Built dist/bundle.js')
