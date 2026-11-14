export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// Name shown on the SSO button ("Sign in with Google"). It must match the
// provider set in the backend (SSO_METADATA_URL). A brand name: not translated.
export const SSO_PROVIDER_NAME = import.meta.env.VITE_SSO_PROVIDER_NAME ?? "Google";
