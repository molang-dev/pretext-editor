import { defineConfig } from 'tsup'
import type { Plugin } from 'esbuild'

// Prevent esbuild from trying to resolve absolute icon URLs at build time.
// These are served as static files at runtime by the consumer's dev server.
const externalIconUrls: Plugin = {
  name: 'external-icon-urls',
  setup(build) {
    build.onResolve({ filter: /^\/icons\// }, (args) => ({ path: args.path, external: true }))
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
  esbuildPlugins: [externalIconUrls],
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
    'mkdir -p dist/svelte dist/controller dist/core dist/angular dist/icons && ' +
    'cp src/svelte/PretextEditor.svelte dist/svelte/ && ' +
    'cp src/angular/editor.component.ts dist/angular/ && ' +
    'cp src/controller/EditorController.ts dist/controller/ && ' +
    'cp src/core/document.ts dist/core/ && ' +
    'cp src/core/renderer.ts dist/core/ && ' +
    'cp src/core/tokenizer.ts dist/core/ && ' +
    'cp src/core/search.ts dist/core/ && ' +
    'cp src/icons/*.svg dist/icons/',
})
