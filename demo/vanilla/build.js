import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'

mkdirSync('dist', { recursive: true })

await esbuild.build({
  entryPoints: ['src/main.cjs'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
})

// Copy CSS from the built package
copyFileSync('../../dist/react/index.css', 'dist/bundle.css')

// Copy icon SVGs to serve at /icons/ path (referenced by CSS mask-image)
mkdirSync('icons', { recursive: true })
for (const f of readdirSync('../../dist/icons')) {
  copyFileSync(`../../dist/icons/${f}`, `icons/${f}`)
}

console.log('Built dist/bundle.js + dist/bundle.css + icons/')
