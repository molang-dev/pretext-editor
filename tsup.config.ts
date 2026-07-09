import { defineConfig } from 'tsup'
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'fs'

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
    '@shikijs/primitive',
    '@shikijs/vscode-textmate',
  ],

  // Post-build: copy source files and inject CSS references
  onSuccess: async () => {
    // Copy framework source files so consumers' compilers can process them.
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

    // Inject CSS import into ESM output so consumer bundlers (Vite/webpack)
    // pick up the CSS automatically without manual import.
    for (const pkg of ['react', 'vue']) {
      const f = `dist/${pkg}/index.js`
      writeFileSync(f, `import './index.css';\n${readFileSync(f, 'utf-8')}`)
    }
  },
})
