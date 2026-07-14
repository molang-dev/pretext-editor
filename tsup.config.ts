import { defineConfig } from 'tsup'
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'fs'

// Thin glue module: creates a Worker from the chunked highlight.worker.js via import.meta.url
const workerSplitConfig = defineConfig({
  entry: { 'worker-split': 'src/core/worker-split.ts' },
  format: ['esm'],
  dts: false,
  splitting: false,
  clean: false,
})

// Chunked worker: grammar files are separate chunks loaded lazily on demand
const workerConfig = defineConfig({
  define: {
    __DEV__: String(process.env.NODE_ENV === 'development'),
  },
  entry: { 'highlight.worker': 'src/worker/highlight.worker.ts' },
  format: ['esm'],
  dts: false,
  splitting: true,
  clean: false,
  noExternal: ['vscode-textmate', 'vscode-oniguruma'],
})

// Bundled worker: all grammars inlined + WASM base64-embedded, fully self-contained (for blob URL)
const workerBundleConfig = defineConfig({
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
  clean: false,
  noExternal: ['vscode-textmate', 'vscode-oniguruma'],
})

const mainConfig = defineConfig({
  define: {
    __DEV__: String(process.env.NODE_ENV === 'development'),
  },
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
    '#worker-impl',
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

const vitePluginConfig = defineConfig({
  entry: { vite: 'src/vite.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  external: ['vite'],
  platform: 'node',
  shims: true,
  clean: false,
})

export default [workerSplitConfig, workerConfig, workerBundleConfig, mainConfig, vitePluginConfig]
