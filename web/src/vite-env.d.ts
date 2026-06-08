/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional build-time override for the public origin (see src/config.ts). */
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
