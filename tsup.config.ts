import { defineConfig } from 'tsup'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'esbuild'

// Handles `import x from '*.svg?raw'` — esbuild doesn't understand the ?raw suffix natively.
const svgRawPlugin: Plugin = {
  name: 'svg-raw',
  setup(build) {
    build.onResolve({ filter: /\.svg\?raw$/ }, args => ({
      path: resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
      namespace: 'svg-raw',
    }))
    build.onLoad({ filter: /.*/, namespace: 'svg-raw' }, args => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, 'utf-8'))}`,
      loader: 'js',
    }))
  },
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'vue/index': 'src/vue/index.ts',
    'svelte/index': 'src/svelte/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  clean: true,
  esbuildPlugins: [svgRawPlugin],
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'vue',
    'svelte',
    'svelte/internal',
    '@chenglou/pretext',
    'shiki',
    'shiki/engine/javascript',
  ],
  // Copy framework source files so consumers' compilers can process them.
  // - Svelte: .svelte file compiled by consumer's Svelte compiler
  // - Angular: .ts with decorators needs Angular compiler; shipped as reference only
  onSuccess:
    'mkdir -p dist/svelte dist/controller dist/core dist/angular && ' +
    'cp src/svelte/PretextEditor.svelte dist/svelte/ && ' +
    'cp src/angular/editor.component.ts dist/angular/ && ' +
    'cp src/controller/EditorController.ts dist/controller/ && ' +
    'cp src/core/document.ts dist/core/ && ' +
    'cp src/core/renderer.ts dist/core/ && ' +
    'cp src/core/tokenizer.ts dist/core/',
})
