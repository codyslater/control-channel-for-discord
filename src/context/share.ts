import * as os from 'node:os'
import * as vscode from 'vscode'
import { FsReader, readGitInfo } from '../git/dotgit'
import { formatContext, WorkContext } from '../shared/contextFormat'

export function currentHost(cfg: { hostName: string }): { host: string; remoteKind: string } {
  const remote = vscode.env.remoteName // 'ssh-remote' | 'tunnel' | 'wsl' | undefined
  if (remote) {
    const authority = vscode.workspace.workspaceFolders?.[0]?.uri.authority ?? ''
    const host = authority.split('+').pop() || 'remote'
    const kind = remote === 'ssh-remote' ? 'ssh' : remote
    return { host, remoteKind: kind }
  }
  return { host: cfg.hostName || os.hostname().split('.')[0], remoteKind: 'local' }
}

export const wsFsReader: FsReader = {
  readFile: async (p) => {
    const base = vscode.workspace.workspaceFolders?.[0]?.uri
    const uri = base ? base.with({ path: p }) : vscode.Uri.file(p)
    try {
      const stat = await vscode.workspace.fs.stat(uri)
      if (stat.type & vscode.FileType.Directory) return null
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
    } catch {
      return null
    }
  },
  readDir: async (p) => {
    const base = vscode.workspace.workspaceFolders?.[0]?.uri
    const uri = base ? base.with({ path: p }) : vscode.Uri.file(p)
    try {
      return (await vscode.workspace.fs.readDirectory(uri)).map(([name]) => name)
    } catch {
      return []
    }
  },
}

export async function collectContext(cfg: { hostName: string }): Promise<WorkContext> {
  const { host, remoteKind } = currentHost(cfg)
  const ctx: WorkContext = { host, remoteKind }
  const editor = vscode.window.activeTextEditor
  const folder = editor
    ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
    : vscode.workspace.workspaceFolders?.[0]
  if (!folder) return ctx
  ctx.repo = folder.name
  ctx.folderPath = folder.uri.path
  if (editor && editor.document.uri.path.startsWith(folder.uri.path)) {
    ctx.file = editor.document.uri.path.slice(folder.uri.path.length + 1)
    ctx.line = editor.selection.start.line + 1
    if (!editor.selection.isEmpty) ctx.endLine = editor.selection.end.line + 1
  }
  const git = await readGitInfo(folder.uri.path, wsFsReader)
  if (git.branch) ctx.branch = git.branch
  ctx.isWorktree = git.isWorktree
  return ctx
}

/** The 📍 context message body — shared by the palette command and /loc. */
export async function locationText(cfg: { hostName: string }): Promise<string> {
  return formatContext(await collectContext(cfg))
}

export function registerShareCommand(deps: {
  cfg: () => { hostName: string }
  currentChannelId: () => string | null
  sendToChannel: (channelId: string, text: string) => Promise<void>
}): vscode.Disposable {
  return vscode.commands.registerCommand('discordVscode.shareContext', async () => {
    const channelId = deps.currentChannelId()
    if (!channelId) {
      void vscode.window.showWarningMessage('Open a Discord channel first (it becomes the share destination).')
      return
    }
    const text = await locationText(deps.cfg())
    await deps.sendToChannel(channelId, text)
  })
}
