import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/aqhealth/',
  server: {
    port: 5180,
  },
  build: {
    chunkSizeWarningLimit: 800,
  },
})
