import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { BASE_PATH, DEFAULT_SITE_URL } from './src/config'

// Build-time public origin: the Deploy workflow exports VITE_SITE_URL; a local
// build falls back to the canonical default. This fills the %VITE_SITE_URL%
// placeholders in index.html so the canonical / Open Graph / Twitter URLs share
// the one source of truth in src/config rather than being hardcoded twice.
const siteUrl = process.env.VITE_SITE_URL || DEFAULT_SITE_URL

// Static SPA served from its own CloudFront distribution at the root path.
// The serving path lives in src/config so the app and the build agree.
export default defineConfig({
  base: BASE_PATH,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'tube-race-html-site-url',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) => html.replaceAll('%VITE_SITE_URL%', siteUrl),
      },
    },
  ],
})
