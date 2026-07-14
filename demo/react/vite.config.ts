import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pretextEditorPlugin, pretextEditorBundlePlugin } from 'pretext-editor/vite'

export default defineConfig(({ command }) => ({
  // base: '/pretext-editor/',
  plugins: [react(), pretextEditorBundlePlugin()],
  define: {
    __DEV__: String(command === 'serve'),
  },
  server: {
    fs: {
      // Allow serving files from the parent package's dist/ (CSS + icons via symlink)
      allow: ['../..'],
    },
  },
}))
