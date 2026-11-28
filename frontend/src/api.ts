// In local development, use Vite as a same-origin proxy to FastAPI. This keeps
// browser requests working when Vite selects a fallback port such as 5177.
export const API_URL = import.meta.env.DEV
  ? window.location.origin
  : (import.meta.env.VITE_API_URL ?? window.location.origin);

export function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: "include",
    cache: init.cache ?? "no-store",
    signal: init.signal ?? AbortSignal.timeout(4000),
  });
}
