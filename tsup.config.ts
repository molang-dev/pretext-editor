import { defineConfig } from 'tsup'
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'fs'

const mainConfig = defineConfig({
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
  shims: true,
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'vue',
    'svelte',
    'svelte/internal',
    '@chenglou/pretext',
    'vscode-textmate',
    'vscode-oniguruma',
  ],

  onSuccess: async () => {
    mkdirSync('dist/svelte', { recursive: true })
    mkdirSync('dist/controller', { recursive: true })
    mkdirSync('dist/core', { recursive: true })
    mkdirSync('dist/angular', { recursive: true })
    mkdirSync('dist/icons', { recursive: true })

    cpSync('src/svelte/PretextEditor.svelte', 'dist/svelte/PretextEditor.svelte')
    cpSync('src/angular/editor.component.ts', 'dist/angular/editor.component.ts')
    cpSync('src/controller/EditorController.ts', 'dist/controller/EditorController.ts')
    cpSync('src/core/document.ts', 'dist/core/document.ts')
    cpSync('src/core/logger.ts', 'dist/core/logger.ts')
    cpSync('src/core/renderer.ts', 'dist/core/renderer.ts')
    cpSync('src/core/tokenizer.ts', 'dist/core/tokenizer.ts')
    cpSync('src/core/search.ts', 'dist/core/search.ts')
    for (const f of readdirSync('src/icons')) {
      if (f.endsWith('.svg')) cpSync(`src/icons/${f}`, `dist/icons/${f}`)
    }

    // Copy WASM to dist so worker can load it via relative URL
    cpSync('node_modules/vscode-oniguruma/release/onig.wasm', 'dist/onig.wasm')

    // Inject CSS import into ESM output
    for (const pkg of ['react', 'vue']) {
      const f = `dist/${pkg}/index.js`
      writeFileSync(f, `import './index.css';\n${readFileSync(f, 'utf-8')}`)
    }
  },
})

// Worker bundle: core logic inline, grammar files as separate chunks (lazy-loaded on demand)
const workerConfig = defineConfig({
  entry: { 'highlight.worker': 'src/worker/highlight.worker.ts' },
  format: ['esm'],
  dts: false,
  splitting: true,
  clean: false,
  noExternal: ['vscode-textmate', 'vscode-oniguruma'],
})

export default [mainConfig, workerConfig]
