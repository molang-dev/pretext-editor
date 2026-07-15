import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { exclude: ['pretext-editor'] },
  server: {
    fs: { allow: ['../..'] },
  },
})
