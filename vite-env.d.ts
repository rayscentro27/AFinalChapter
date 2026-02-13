

interface ImportMetaEnv {
  readonly VITE_API_KEY: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_STRIPE_PUBLIC_KEY: string
  readonly VITE_BACKEND_MODE: string
  readonly VITE_ENV_NAME: string
  readonly VITE_DEMO_BANNER: string
  readonly VITE_AI_ENABLED: string
  readonly VITE_SHEETS_API_BASE_URL: string
  readonly VITE_SHEETS_ADMIN_TOKEN: string
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}