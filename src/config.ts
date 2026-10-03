/**
 * Client-side configuration.
 * Injected at build time via Vite define or env.
 */

// In Node.js test environment, import.meta.env may not have VITE_ vars.
// Provide a fallback to avoid crashes during server-side rendering in tests.
const viteEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
export const API_BASE_URL = (viteEnv as Record<string, string>).VITE_API_BASE_URL ?? (typeof process !== 'undefined' && process.env.VITE_API_BASE_URL) ?? '';