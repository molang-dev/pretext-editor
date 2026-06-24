import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    fs: {
      // Allow serving files from the parent package's dist/ (CSS + icons via symlink)
      allow: ['../..'],
    },
  },
})
