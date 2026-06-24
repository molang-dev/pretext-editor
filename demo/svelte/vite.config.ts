import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    fs: {
      // Allow serving files from the parent package's dist/ (icons referenced by Svelte component)
      allow: ['../..'],
    },
  },
})
