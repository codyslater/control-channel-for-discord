import esbuild from 'esbuild'

const watch = process.argv.includes('--watch')
const configs = [
  {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    external: ['vscode', 'zlib-sync', 'bufferutil', 'utf-8-validate'],
  },
  {
    // Demo backend (DISCORD_VSCODE_DEMO=1) — separate bundle, excluded from the VSIX.
    entryPoints: ['src/demo/index.ts'],
    bundle: true,
    outfile: 'dist/demo.js',
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    external: ['vscode'],
  },
  {
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    sourcemap: true,
  },
]
for (const cfg of configs) {
  if (watch) (await esbuild.context(cfg)).watch()
  else await esbuild.build(cfg)
}
