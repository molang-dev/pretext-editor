import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { pretextEditorPlugin } from 'pretext-editor/vite'

export default defineConfig({
  base: '/pretext-editor/',
  plugins: [vue(), pretextEditorPlugin()],
})
