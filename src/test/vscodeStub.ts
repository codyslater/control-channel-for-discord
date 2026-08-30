/** Minimal stand-in for the `vscode` module in vitest (aliased in vitest.config.ts).
 *  Only what host-side units touch at runtime; extend as tests need. */
export const window = { showErrorMessage: async () => undefined }
export const env = { openExternal: async () => true }
export const Uri = { parse: (s: string) => ({ toString: () => s }), joinPath: (...p: unknown[]) => ({ toString: () => p.join('/') }) }
export const commands = { executeCommand: async () => undefined }
