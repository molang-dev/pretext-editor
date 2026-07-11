import * as esbuild from 'esbuild'
import { mkdirSync, cpSync, realpathSync } from 'fs'

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
cpSync(pkgDist, 'dist', { recursive: true, force: true })

console.log('Built dist/bundle.js')
