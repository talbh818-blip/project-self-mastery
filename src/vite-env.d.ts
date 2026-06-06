/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build id injected by Vite (see vite.config.ts → define). Compared against
// /version.json to detect that a newer build has been deployed.
declare const __APP_VERSION__: number;
