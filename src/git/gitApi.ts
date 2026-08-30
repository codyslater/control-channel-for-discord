import * as vscode from 'vscode'

interface GitRepository {
  rootUri: vscode.Uri
  diff(cached?: boolean): Promise<string>
}
interface GitAPI {
  repositories: GitRepository[]
}

/** Working-tree diff of the active editor's repo (else the first repo), via the
 *  built-in vscode.git extension — no git binary spawn, works over Remote-SSH.
 *  Returns null when the git extension or a repository is unavailable. */
export async function getWorkingTreeDiff(): Promise<string | null> {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitAPI }>('vscode.git')
  if (!ext) return null
  const api = (ext.isActive ? ext.exports : await ext.activate()).getAPI(1)
  const active = vscode.window.activeTextEditor?.document.uri
  const folder = active ? vscode.workspace.getWorkspaceFolder(active) : vscode.workspace.workspaceFolders?.[0]
  const repo =
    (folder && api.repositories.find((r) => folder.uri.path.startsWith(r.rootUri.path))) ?? api.repositories[0]
  if (!repo) return null
  return repo.diff(false)
}
