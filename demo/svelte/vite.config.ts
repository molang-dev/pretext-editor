import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { pretextEditorPlugin } from 'pretext-editor/vite'

export default defineConfig({
  plugins: [svelte(), pretextEditorPlugin()],
})
