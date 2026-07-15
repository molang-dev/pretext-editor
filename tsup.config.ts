import { defineConfig } from 'tsup'
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'fs'

function stripDevLogs(path: string): void {
  const content = readFileSync(path, 'utf-8')
  const replaced = content.replace(/if \([^)]*__DEV__[^)]*\) [^\n]+/g, '/* __DEV__ stripped */')
  if (replaced !== content) writeFileSync(path, replaced)
}

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
  clean: false,
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
    'pretext-editor/worker-create',
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
    stripDevLogs('dist/controller/EditorController.ts')
    stripDevLogs('dist/core/renderer.ts')
    for (const f of readdirSync('src/icons')) {
      if (f.endsWith('.svg')) cpSync(`src/icons/${f}`, `dist/icons/${f}`)
    }

    // Inject CSS import into ESM output
    for (const pkg of ['react', 'vue']) {
      const f = `dist/${pkg}/index.js`
      writeFileSync(f, `import './index.css';\n${readFileSync(f, 'utf-8')}`)
    }
  },
})

export default mainConfig
