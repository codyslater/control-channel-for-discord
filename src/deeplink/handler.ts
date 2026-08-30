import * as os from 'node:os'
import * as vscode from 'vscode'
import { readConfig } from '../auth'
import { currentHost } from '../context/share'
import { hostMatches, OpenParams, parseOpenUri } from '../shared/uri'

const PENDING_KEY = 'discordVscode.pendingReveal'
interface Pending extends OpenParams {
  ts: number
}

// Set by extension.ts once the Discord service/chat panels exist (Task: jump-links).
// A plain module-level setter — same pattern as refs/open.ts's setExtensionContext —
// since the deep-link handler is registered before those pieces are constructed.
let channelOpener: ((channelId: string) => Promise<void>) | null = null
export function setChannelOpener(fn: (channelId: string) => Promise<void>): void {
  channelOpener = fn
}

function currentIdentity() {
  // Reuse Task 13's currentHost() (src/context/share.ts) rather than reading
  // workspaceFolders[0]?.uri.authority directly: in a remote window with NO folder open, that
  // authority is undefined, which would make hostMatches fall back to comparing against the
  // LOCAL machine's hostname (this extension runs ui-side) even though we're actually remote.
  // currentHost() instead falls back to the host literal 'remote' in that case, which won't
  // false-match a real hostname.
  const { host, remoteKind } = currentHost(readConfig())
  return {
    remoteAuthority: remoteKind !== 'local' ? host : undefined,
    localHostname: readConfig().hostName || os.hostname(),
    aliases: readConfig().hostAliases,
  }
}

async function openInPlace(p: OpenParams) {
  // `file` is optional — a jump-link may only carry `chat` (+ host/folder), with no
  // specific file to reveal yet (e.g. a fresh session-launch link).
  if (p.file) {
    // Lazy import avoids a cycle (open.ts routes deeplink refs back here).
    const { openFileRefPublic } = await import('../refs/open')
    const path = p.folder ? `${p.folder}/${p.file}` : p.file
    await openFileRefPublic(path, { line: p.line, col: p.col, endLine: p.endLine, endCol: p.endCol, cell: p.cell })
  }
  if (p.chat && channelOpener) await channelOpener(p.chat)
}

export async function handleOpenParams(p: OpenParams, ctx: vscode.ExtensionContext): Promise<void> {
  const here = currentIdentity()
  const folders = vscode.workspace.workspaceFolders ?? []
  if (hostMatches(p.host, here, p.tunnel)) {
    // No `folder` param → spec says resolve in the CURRENT window via the existing ref
    // resolution ladder, regardless of whether any folder happens to be open here.
    const inWorkspace = !p.folder || folders.some((f) => f.uri.path === p.folder)
    if (inWorkspace) return openInPlace(p)
    // Right machine, different folder (e.g. another worktree) — but only take this branch when
    // there's an existing folder to anchor the new window's URI scheme/authority on. A remote
    // window with no folder open has no workspaceFolders[0] to dereference; fall through to the
    // generic open-new-window path below instead of guessing at a scheme.
    if (folders.length > 0) {
      const pick = await vscode.window.showInformationMessage(
        `Open ${p.folder} in a new window?`, { modal: false }, 'Open',
      )
      if (pick !== 'Open') return
      await ctx.globalState.update(PENDING_KEY, { ...p, ts: Date.now() } satisfies Pending)
      const base = folders[0].uri
      await vscode.commands.executeCommand('vscode.openFolder', base.with({ path: p.folder! }), { forceNewWindow: true })
      return
    }
  }
  // Different machine, or same host with no anchor folder to reuse: open a window at the target.
  // Only record a pendingReveal when `folder` is present — checkPendingReveal matches on
  // `f.uri.path === p.folder`, which can never succeed for `folder: undefined`, so recording it
  // in that case would just leave a silent, permanently-unmatchable entry in globalState. This
  // also means a `chat`-only link (no folder) can't be delivered to a freshly-spawned remote
  // window — known limitation; in practice jump-links always pair `chat` with a `folder`.
  const targetHost = p.host ?? here.remoteAuthority ?? here.localHostname
  let authority: string
  if (p.tunnel) {
    // A tunnel link connects VS Code to an attacker-nameable tunnel. Confirm first unless the
    // user has opted into trusting producers (discordVscode.trustTunnelLinks) — e.g. their own
    // link-assembler on a private server. The producer sets `tunnel` only after verifying it's
    // live; the extension can't re-check, so consent replaces that trust for public installs.
    if (!readConfig().trustTunnelLinks) {
      const pick = await vscode.window.showInformationMessage(
        `Open ${p.folder ?? p.file ?? 'workspace'} on tunnel "${p.tunnel}"?`, 'Open',
      )
      if (pick !== 'Open') return
    }
    authority = `tunnel+${p.tunnel}`
  } else {
    const pick = await vscode.window.showInformationMessage(
      `Open ${p.folder ?? p.file ?? 'workspace'} on ${targetHost} via SSH?`, 'Open',
    )
    if (pick !== 'Open') return
    authority = `ssh-remote+${targetHost}`
  }
  if (p.folder) await ctx.globalState.update(PENDING_KEY, { ...p, ts: Date.now() } satisfies Pending)
  const target = vscode.Uri.from({ scheme: 'vscode-remote', authority, path: p.folder ?? '/' })
  await vscode.commands.executeCommand('vscode.openFolder', target, { forceNewWindow: true })
}

export function registerDeepLinks(ctx: vscode.ExtensionContext): vscode.Disposable {
  return vscode.window.registerUriHandler({
    handleUri: (uri) => {
      const p = parseOpenUri(uri.toString(true))
      if (p) void handleOpenParams(p, ctx)
      else void vscode.window.showWarningMessage(`Unrecognized Discord deep link: ${uri.path}`)
    },
  })
}

/** New windows check whether they were opened to reveal a file (globalState is shared per machine for ui extensions). */
export async function checkPendingReveal(ctx: vscode.ExtensionContext): Promise<void> {
  const p = ctx.globalState.get<Pending>(PENDING_KEY)
  if (!p || Date.now() - p.ts > 120_000) return
  const match = (vscode.workspace.workspaceFolders ?? []).some((f) => f.uri.path === p.folder)
  if (!match) return
  await ctx.globalState.update(PENDING_KEY, undefined)
  await openInPlace(p)
}
