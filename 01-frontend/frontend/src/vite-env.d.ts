interface ViteTypeOptions {
  strictImportMetaEnv: true;
}
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_BASE_PATH: string;
  readonly VITE_LOCAL_USER_ID?: string;
  readonly VITE_LOCAL_USER_EMAIL?: string;
  readonly VITE_LOCAL_USER_FIRST_NAME?: string;
  readonly VITE_LOCAL_USER_LAST_NAME?: string;
  readonly VITE_TEMPORAL_UI_BASE_URL?: string;
  readonly VITE_ALLOWED_DOWNLOAD_ORIGINS?: string;
  readonly VITE_ALLOWED_UPLOAD_ORIGINS?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_ENABLE_EWMS_FEATURE?: string;
  readonly VITE_ENABLE_AUTH_REDIRECT_RETRY?: string;
  readonly VITE_DEV_API_MODE?: string;
  readonly VITE_ENABLE_MAINTENANCE_MODE?: string;
  readonly VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE?: string;
  readonly VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE?: string;
  readonly VITE_DANGEROUS_ENABLE_ROLE_SWITCHER?: string;
  readonly ALLOW_DEV_MODE?: string;
  readonly VITE_PRODUCT_MODE?: string;
  readonly VITE_PRODUCT_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __APP_CONFIG__?: {
    VITE_API_BASE_URL?: string;
    VITE_APP_BASE_PATH?: string;
    VITE_TEMPORAL_UI_BASE_URL?: string;
    VITE_ALLOWED_DOWNLOAD_ORIGINS?: string;
    VITE_ALLOWED_UPLOAD_ORIGINS?: string;
    VITE_SENTRY_DSN?: string;
    VITE_SENTRY_ENVIRONMENT?: string;
    VITE_ENABLE_EWMS_FEATURE?: string;
    VITE_ENABLE_AUTH_REDIRECT_RETRY?: string;
    VITE_ENABLE_MAINTENANCE_MODE?: string;
    VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE?: string;
    VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE?: string;
    VITE_DANGEROUS_ENABLE_ROLE_SWITCHER?: string;
    ALLOW_DEV_MODE?: string;
    VITE_PRODUCT_MODE?: string;
    VITE_PRODUCT_DOMAIN?: string;
  };
}
