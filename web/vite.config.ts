import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { BASE_PATH } from './src/config'

// Static SPA served from its own CloudFront distribution at the root path.
// The serving path lives in src/config so the app and the build agree.
export default defineConfig({
  base: BASE_PATH,
  plugins: [react(), tailwindcss()],
})
