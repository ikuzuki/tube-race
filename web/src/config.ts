// Single source of truth for where and how Tube Race is hosted. Imported by
// both browser code (the app) and Node code (vite.config.ts), so it must not
// touch anything that only exists in one of those environments without a guard.

/**
 * Path the app is served from. The site has its own CloudFront distribution
 * and lives at the root, so this is '/'. If it ever moves under a subpath,
 * change this one constant (and Vite's `base` follows automatically).
 */
export const BASE_PATH = '/'

/** Canonical public origin. Used for canonical/OG/sitemap URLs and share text. */
export const DEFAULT_SITE_URL = 'https://tube-race.isseikuzuki.co.uk'

/**
 * Public origin in use. A `VITE_SITE_URL` build-time env var overrides the
 * default (handy for preview deploys). `import.meta.env` only exists under
 * Vite; when this module is imported from Node (vite.config.ts) it is
 * undefined, so the optional chain falls back to the default rather than
 * throwing.
 */
export const SITE_URL: string = import.meta.env?.VITE_SITE_URL || DEFAULT_SITE_URL
