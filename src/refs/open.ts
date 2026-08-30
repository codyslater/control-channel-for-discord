import * as vscode from 'vscode'
import { Ref } from '../shared/refs'
import { clampCellIndex, NormalizedSelection, normalizeSelection, OpenAt } from '../shared/selection'
import { Finder, isPathOutsideWorkspace, resolveFileRef } from './resolve'

let extCtx: vscode.ExtensionContext | null = null
export function setExtensionContext(c: vscode.ExtensionContext) {
  extCtx = c
}

/** Build URIs in the workspace's scheme so remote windows resolve remote files. */
function wsUri(absPath: string): vscode.Uri {
  const base = vscode.workspace.workspaceFolders?.[0]?.uri
  return base ? base.with({ path: absPath }) : vscode.Uri.file(absPath)
}

const finder: Finder = {
  exists: async (p) => {
    try {
      await vscode.workspace.fs.stat(wsUri(p))
      return true
    } catch {
      return false
    }
  },
  workspaceFolders: () =>
    (vscode.workspace.workspaceFolders ?? []).map((f) => ({ name: f.name, path: f.uri.path })),
  // Basenames containing VS Code glob metacharacters are filtered out before reaching here by
  // resolveFileRef's guard (src/refs/resolve.ts) — backslash is not a valid escape in VS Code's
  // GlobPattern dialect, so this rung is only ever called with literal-safe basenames.
  findByBasename: async (b) =>
    (await vscode.workspace.findFiles(`**/${b}`, '**/node_modules/**', 20)).map((u) => u.path),
}

function toVsRange(sel: NormalizedSelection): vscode.Range {
  return new vscode.Range(sel.start.line, sel.start.ch, sel.end.line, sel.end.ch)
}

async function openFileAt(absPath: string, at: OpenAt = {}) {
  const uri = wsUri(absPath)
  if (absPath.endsWith('.ipynb')) {
    // No cell → plain notebook open, as before. (Flattened line numbers are
    // deliberately not mapped onto cells — see the 2026-08-10 spec.)
    if (at.cell === undefined) {
      await vscode.commands.executeCommand('vscode.open', uri)
      return
    }
    try {
      const nb = await vscode.workspace.openNotebookDocument(uri)
      const nbEditor = await vscode.window.showNotebookDocument(nb)
      // Notebook is already visible — that's the correct degradation for a 0-cell .ipynb;
      // there's no cell to reveal or select into.
      if (nb.cellCount === 0) return
      const idx = clampCellIndex(at.cell, nb.cellCount)
      nbEditor.revealRange(new vscode.NotebookRange(idx, idx + 1), vscode.NotebookEditorRevealType.InCenter)
      // Each cell is its own text document; selecting inside it reuses the file path.
      const cellDoc = nb.cellAt(idx).document
      const sel = cellDoc.validateRange(toVsRange(normalizeSelection(at)))
      await vscode.window.showTextDocument(cellDoc, { selection: sel })
    } catch {
      // Corrupt/unreadable .ipynb — both entry points (deep link handler, webview openRef)
      // fire-and-forget this, so degrade with a toast instead of an unhandled rejection.
      void vscode.window.showWarningMessage(`Couldn't open notebook: ${absPath}`)
    }
    return
  }
  const doc = await vscode.workspace.openTextDocument(uri)
  const sel = doc.validateRange(toVsRange(normalizeSelection(at)))
  await vscode.window.showTextDocument(doc, { selection: sel })
}

async function openFileRef(path: string, at: OpenAt = {}) {
  const res = await resolveFileRef(path, finder)
  if (res.result === 'found') {
    // Chat refs and deep links are untrusted; a path outside the workspace
    // (absolute or `..`-escaping) opens only after an explicit confirmation.
    if (isPathOutsideWorkspace(res.path, finder.workspaceFolders().map((f) => f.path))) {
      const pick = await vscode.window.showWarningMessage(
        `Open a file from outside your workspace?\n${res.path}`, { modal: false }, 'Open',
      )
      if (pick !== 'Open') return
    }
    return openFileAt(res.path, at)
  }
  if (res.result === 'ambiguous') {
    const pick = await vscode.window.showQuickPick(res.candidates, { title: `Multiple matches for ${path}` })
    if (pick) return openFileAt(pick, at)
    return
  }
  const copy = await vscode.window.showInformationMessage(`Not found in this workspace: ${path}`, 'Copy path')
  if (copy) await vscode.env.clipboard.writeText(path)
}

/** Exposes the file-open path to the deep-link handler (src/deeplink/handler.ts). */
export async function openFileRefPublic(path: string, at?: OpenAt) {
  return openFileRef(path, at)
}

async function shaAction(sha: string) {
  const gitExt = vscode.extensions.getExtension<{ getAPI(v: 1): { repositories: { getCommit(ref: string): Promise<{ message: string; authorName?: string }> }[] } }>('vscode.git')?.exports
  const repo = gitExt?.getAPI(1).repositories[0]
  let detail = ''
  if (repo) {
    try {
      const c = await repo.getCommit(sha)
      detail = ` — ${c.authorName ?? '?'}: ${c.message.split('\n')[0]}`
    } catch {
      /* unknown sha or unreachable API — copy-only */
    }
  }
  const copy = await vscode.window.showInformationMessage(`${sha.slice(0, 12)}${detail}`, 'Copy SHA')
  if (copy) await vscode.env.clipboard.writeText(sha)
}

export async function openRef(ref: Ref): Promise<void> {
  switch (ref.kind) {
    case 'file':
      return openFileRef(ref.path, { line: ref.line, col: ref.col, endLine: ref.endLine, endCol: ref.endCol, cell: ref.cell })
    case 'sha':
      return shaAction(ref.sha)
    case 'deeplink': {
      const { handleOpenParams } = await import('../deeplink/handler')
      if (extCtx) return handleOpenParams(ref.params, extCtx)
      return
    }
  }
}
