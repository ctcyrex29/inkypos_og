/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The InkyPOS API, e.g. https://api.inkypos.co.zw. Defaults to port 8000 on the same host. */
  readonly VITE_API_URL?: string;
}
