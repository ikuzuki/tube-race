import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Static SPA. base is relative so it works on any static host subpath.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
