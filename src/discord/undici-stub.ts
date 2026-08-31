/** Stand-in for `undici`, aliased in esbuild.mjs so the real package (and its
 *  embedded WASM HTTP parser) stays out of the bundle. discord.js only touches
 *  `fetch`/`FormData`/`Headers` here, and the REST layer's `request` is
 *  unreachable because the client is constructed with a native-fetch
 *  `makeRequest` (see service.ts). */
export const fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)
export const FormData = globalThis.FormData
export const Headers = globalThis.Headers
export function request(): never {
  throw new Error('undici is stubbed out — REST must go through the native-fetch makeRequest')
}
