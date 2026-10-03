/**
 * Client-side configuration. One env var, one code path.
 *
 * `VITE_API_BASE_URL` is the API ORIGIN ONLY: `https://host`, no trailing slash and
 * no `/v1` suffix. The version segment is appended by `apiUrl`, never written by a
 * caller, because a version that lives in two places is a version that eventually
 * disagrees with itself.
 *
 * Empty or unset means same-origin. Requests then go out on relative paths, so the
 * browser resolves the host from the page and the dev proxy in `vite.config.ts`
 * keeps working.
 *
 * `import.meta.env` is read defensively because it does not exist under plain Node,
 * and `server/screens.test.ts` renders these components with `renderToString`. The
 * file stays dependency-free so it can be imported from a Node test.
 */

// In Node.js test environment, import.meta.env may not have VITE_ vars.
const viteEnv =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

function readEnv(name: string): string {
  const fromVite = (viteEnv as Record<string, string | undefined>)[name];
  if (typeof fromVite === 'string') return fromVite.trim();
  const fromProcess =
    typeof process !== 'undefined' && process.env ? process.env[name] : undefined;
  return typeof fromProcess === 'string' ? fromProcess.trim() : '';
}

function normalizeBase(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export const API_BASE_URL = normalizeBase(readEnv('VITE_API_BASE_URL'));

/**
 * Builds the URL for any client request: `<base>/v1<path>`.
 *
 * `path` is the path below `/v1` and may be written with or without its leading
 * slash. `baseUrl` overrides the configured origin so a test can point the loader at
 * its own server.
 */
export function apiUrl(path: string, baseUrl: string = API_BASE_URL): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${normalizeBase(baseUrl)}/v1${suffix}`;
}