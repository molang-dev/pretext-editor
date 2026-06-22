import * as esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/main.cjs'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
})

console.log('Built dist/bundle.js')
