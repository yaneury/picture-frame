/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INTERVAL_IN_SECS: string
  readonly VITE_USE_DATA_DIR: "true" | "false"
  readonly VITE_SORT_BY: "random" | "date"
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
