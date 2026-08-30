import * as vscode from 'vscode'
import { wsFsReader } from '../context/share'
import { findWorktreeForBranch, isValidBranchName, readGitInfo } from '../git/dotgit'

export function registerWorktreeAction(): vscode.Disposable {
  return vscode.commands.registerCommand(
    'discordVscode.openWorktreeForBranch',
    async (ctx?: { selectedText?: string }) => {
      const branch =
        ctx?.selectedText?.trim() ||
        (await vscode.window.showInputBox({ title: 'Branch name', prompt: 'Branch to check out or open as worktree' }))
      if (!branch) return
      // ctx.selectedText is arbitrary Discord message text — untrusted input from other
      // users/bots. It later gets interpolated into a terminal command string, so it must
      // be validated against a strict allowlist before it can touch a shell.
      if (!isValidBranchName(branch)) {
        void vscode.window.showErrorMessage(`Not a valid branch name: ${truncate(branch)}`)
        return
      }
      const folder = vscode.workspace.workspaceFolders?.[0]
      if (!folder) {
        void vscode.window.showWarningMessage('No workspace folder open.')
        return
      }
      const git = await readGitInfo(folder.uri.path, wsFsReader)
      if (!git.commonDir) {
        void vscode.window.showWarningMessage(`${folder.name} is not a git repository.`)
        return
      }
      const wtPath = await findWorktreeForBranch(git.commonDir, branch, wsFsReader)
      if (wtPath) {
        if (wtPath === folder.uri.path) {
          void vscode.window.showInformationMessage(`Already in the worktree for ${branch}.`)
          return
        }
        const pick = await vscode.window.showInformationMessage(
          `Branch ${branch} lives in worktree ${wtPath}`, 'Open in New Window',
        )
        if (pick) await vscode.commands.executeCommand('vscode.openFolder', folder.uri.with({ path: wtPath }), { forceNewWindow: true })
        return
      }
      const choice = await vscode.window.showQuickPick(
        [
          { label: `Check out ${branch} here`, action: 'checkout' as const },
          { label: `Create worktree for ${branch}`, action: 'worktree' as const },
        ],
        { title: `No existing worktree has ${branch}` },
      )
      if (!choice) return
      // Terminals run on the workspace side — correct machine local or remote.
      const term = vscode.window.createTerminal({ name: 'discord-vscode git', cwd: folder.uri })
      term.show()
      // `branch` passed the isValidBranchName allowlist above, so it contains no shell
      // metacharacters and plain interpolation is safe. `sendText(cmd, false)` types the
      // command into the terminal WITHOUT submitting it — the user reviews and presses
      // Enter themselves (defense in depth on top of the validation gate).
      if (choice.action === 'checkout') {
        term.sendText(`git checkout ${branch}`, false)
      } else {
        const repoName = folder.uri.path.split('/').pop()
        const dest = await vscode.window.showInputBox({
          title: 'Worktree path',
          value: `../${repoName}-${branch.replace(/[^\w.-]/g, '-')}`,
        })
        if (dest) term.sendText(`git worktree add ${dest} ${branch}`, false)
      }
    },
  )
}

function truncate(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}
