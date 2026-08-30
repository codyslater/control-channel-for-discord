export const AUTHORITY = 'c0d3s.control-channel-for-discord'

/** URI schemes of editors known to run this extension — official VS Code plus the
 * forks served by Open VSX. Parsing and in-chat link detection are bound to this
 * list so ordinary URLs never become deep-link candidates; building honors any
 * well-formed scheme the running editor reports (`vscode.env.uriScheme`), because
 * the editor is authoritative for its own scheme even when it isn't listed here. */
export const EDITOR_SCHEMES = ['vscode', 'vscode-insiders', 'vscodium', 'cursor', 'windsurf'] as const

const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/

export function isEditorUri(s: string): boolean {
  return EDITOR_SCHEMES.some((scheme) => s.startsWith(`${scheme}://`))
}

export interface OpenParams {
  host?: string
  folder?: string
  /** Absent when the link's job is only to open a chat (`chat`) and/or reveal a
   * folder/host — e.g. a session-launch jump-link with no specific file yet. */
  file?: string
  line?: number
  col?: number
  /** Channel or thread ID to open in the extension's chat UI alongside the file/folder. */
  chat?: string
  /** Producer-declared VS Code Remote Tunnels tunnel name for `host`, verified live at link-
   * assembly time. When set and `host` doesn't match the current machine, the handler
   * auto-connects via `vscode-remote://tunnel+<name>/...` instead of prompting for SSH. */
  tunnel?: string
  /** 1-based notebook cell index. Only meaningful when `file` ends `.ipynb`;
   * when present, `line`/`col`/`endLine`/`endCol` are relative to that cell's source. */
  cell?: number
  /** Range end (1-based, inclusive). `endLine` requires `line`; `endCol` requires `endLine`. */
  endLine?: number
  endCol?: number
}

export function parseOpenUri(uri: string): OpenParams | null {
  let u: URL
  try {
    u = new URL(uri)
  } catch {
    return null
  }
  // <scheme>://authority/open — URL() puts 'authority' in host for these schemes
  if (!(EDITOR_SCHEMES as readonly string[]).includes(u.protocol.replace(/:$/, '')) || u.pathname !== '/open') return null
  const q = u.searchParams
  const file = q.get('file')
  const folder = q.get('folder')
  const chat = q.get('chat')
  // At least one of file/folder/chat must be present — a bare `host` (or nothing)
  // has no target to act on.
  if (!file && !folder && !chat) return null
  const p: OpenParams = {}
  if (file) p.file = file
  const host = q.get('host')
  // Hostnames/aliases only — the value lands in a vscode-remote authority
  // (`ssh-remote+<host>`), so this also blocks authority injection ('+', '/').
  // Invalid → dropped, which degrades to current-window semantics.
  if (host && /^[A-Za-z0-9._@-]{1,128}$/.test(host)) p.host = host
  if (folder) p.folder = folder
  if (chat) p.chat = chat
  const tunnel = q.get('tunnel')
  // Invalid tunnel names are dropped, not fatal — the SSH-prompt path is the safe fallback,
  // mirroring the repo's glob/branch-name hardening precedent. This also blocks authority
  // injection: an unvalidated value would flow into `vscode-remote://tunnel+<name>/...`.
  if (tunnel && /^[A-Za-z0-9-]{1,64}$/.test(tunnel)) p.tunnel = tunnel
  const line = q.get('line')
  const col = q.get('col')
  if (line && /^\d+$/.test(line)) p.line = Number(line)
  if (col && /^\d+$/.test(col)) p.col = Number(col)
  const cell = q.get('cell')
  if (cell && /^\d+$/.test(cell) && file?.endsWith('.ipynb')) p.cell = Number(cell)
  const endLine = q.get('endLine')
  if (p.line !== undefined && endLine && /^\d+$/.test(endLine)) {
    p.endLine = Number(endLine)
    const endCol = q.get('endCol')
    if (endCol && /^\d+$/.test(endCol)) p.endCol = Number(endCol)
  }
  return p
}

export function buildOpenUri(p: OpenParams, scheme = 'vscode'): string {
  const q = new URLSearchParams()
  if (p.host) q.set('host', p.host)
  if (p.folder) q.set('folder', p.folder)
  if (p.chat) q.set('chat', p.chat)
  if (p.tunnel) q.set('tunnel', p.tunnel)
  if (p.file) q.set('file', p.file)
  if (p.line !== undefined) q.set('line', String(p.line))
  if (p.col !== undefined) q.set('col', String(p.col))
  if (p.cell !== undefined) q.set('cell', String(p.cell))
  if (p.endLine !== undefined) q.set('endLine', String(p.endLine))
  if (p.endCol !== undefined) q.set('endCol', String(p.endCol))
  const s = SCHEME_RE.test(scheme) ? scheme : 'vscode'
  return `${s}://${AUTHORITY}/open?${q.toString()}`
}

export function buildRedirectUrl(p: OpenParams, scheme = 'vscode'): string {
  const s = SCHEME_RE.test(scheme) ? scheme : 'vscode'
  const uri = buildOpenUri(p, s)
  // vscode.dev/redirect only forwards to official VS Code builds; fork schemes go
  // bare — clickable in this extension's chat, plain text in stock Discord clients.
  if (s !== 'vscode' && s !== 'vscode-insiders') return uri
  return `https://vscode.dev/redirect?url=${encodeURIComponent(uri)}`
}

export function unwrapRedirect(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || u.hostname !== 'vscode.dev' || u.pathname !== '/redirect') return null
  const inner = u.searchParams.get('url')
  return inner && isEditorUri(inner) ? inner : null
}

const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/

function shortName(s: string): string {
  const lower = s.toLowerCase()
  // Dotted-quad literals must compare whole — splitting on '.' would equate
  // every address sharing a first octet.
  return IPV4_RE.test(lower) ? lower : lower.split('.')[0]
}

export function hostMatches(
  target: string | undefined,
  current: { remoteAuthority?: string; localHostname: string; aliases?: string[] },
  tunnel?: string,
): boolean {
  if (current.remoteAuthority) {
    const after = current.remoteAuthority.split('+').pop() ?? ''
    // Already connected to the exact tunnel the link names — same machine even
    // when the tunnel name differs from the hostname (gpubox vs gpubox-tunnel).
    if (tunnel && after.toLowerCase() === tunnel.toLowerCase()) return true
    if (!target) return true
    const t = shortName(target)
    if (shortName(after) === t) return true
    // Aliases cover spellings the producer can't know (tunnel name, FQDN, IP);
    // previously only consulted in local windows.
    return (current.aliases ?? []).some((a) => shortName(a) === t)
  }
  if (!target) return true
  const t = shortName(target)
  if (shortName(current.localHostname) === t) return true
  return (current.aliases ?? []).some((a) => shortName(a) === t)
}
