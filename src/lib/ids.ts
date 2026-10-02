/**
 * Identifier generation shared by the client and the server.
 *
 * This exists because `server/financialEngine.ts` is imported by two client
 * components — `DashboardView` and `GoalsView` need `goalProgress`, and the
 * engine has to stay the one place a figure is computed (constitution Principle
 * I). It began with `import { randomUUID } from 'node:crypto'`, and Vite
 * externalizes Node builtins for the browser, so the module threw
 *
 *   Module "node:crypto" has been externalized for browser compatibility
 *
 * while loading, before React mounted. The site rendered a completely white page
 * with no error boundary and no visible message.
 *
 * `globalThis.crypto.randomUUID` is the same API in both runtimes: Node 19+ and
 * every browser that supports the app. Using it keeps the engine free of Node
 * builtins, which is what makes it shareable at all.
 *
 * Not a general-purpose id library. Ids here are opaque and only need to be
 * unique within a process.
 */

/**
 * A random identifier, or null where the runtime provides no Web Crypto.
 *
 * Null rather than a throw or a Math.random fallback: an id is used to address a
 * financial record, and a colliding or predictable one is worse than a caller
 * finding out that the environment cannot mint ids. Every caller in this codebase
 * treats the result as a template string, so a missing id degrades to an obviously
 * unusable id rather than silently colliding.
 */
export function randomId(): string | null {
  const webcrypto = globalThis.crypto;
  if (typeof webcrypto?.randomUUID === 'function') {
    return webcrypto.randomUUID();
  }
  return null;
}

/**
 * A prefixed identifier.
 *
 * The prefix is what makes an id readable in a log or a database dump. When no id
 * can be minted, the prefix alone is returned rather than an invented value:
 * `ins_micro_unavailable` is visibly wrong, whereas a made-up hex string looks
 * like a real id and would be filed as one.
 */
export function prefixedId(prefix: string): string {
  const id = randomId();
  return id ? `${prefix}_${id}` : `${prefix}_unavailable`;
}