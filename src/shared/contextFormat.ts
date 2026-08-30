import { buildRedirectUrl } from './uri'

export interface WorkContext {
  host: string
  remoteKind: 'local' | 'ssh' | 'tunnel' | 'wsl' | string
  repo?: string
  isWorktree?: boolean
  folderPath?: string
  file?: string
  line?: number
  endLine?: number
  branch?: string
}

export function formatContext(c: WorkContext, scheme?: string): string {
  const parts: string[] = []
  parts.push(c.remoteKind === 'local' ? c.host : `${c.host} (${c.remoteKind})`)
  if (c.repo) parts.push(c.isWorktree ? `${c.repo} (worktree)` : c.repo)
  if (c.file) {
    let loc = c.file
    if (c.line !== undefined) {
      loc += `:${c.line}`
      if (c.endLine !== undefined && c.endLine !== c.line) loc += `-${c.endLine}`
    }
    parts.push(loc)
  }
  if (c.branch) parts.push(c.branch)
  let out = `📍 ${parts.join(' · ')}`
  if (c.file && c.folderPath) {
    out += `\n[open](${buildRedirectUrl({ host: c.host, folder: c.folderPath, file: c.file, line: c.line }, scheme)})`
  }
  return out
}
