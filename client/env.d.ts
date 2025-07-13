interface ImportMetaEnv {
  readonly VITE_EVOLUTION_API_URL: string;
  readonly VITE_WEBHOOK_URL: string;
  readonly VITE_INSTANCE_NAME: string;
  readonly VITE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

