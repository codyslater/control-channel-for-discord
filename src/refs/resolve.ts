export interface Finder {
  exists(absPath: string): Promise<boolean>
  workspaceFolders(): { name: string; path: string }[]
  findByBasename(basename: string): Promise<string[]>
}

export type Resolution =
  | { result: 'found'; path: string }
  | { result: 'ambiguous'; candidates: string[] }
  | { result: 'none' }

/**
 * VS Code's GlobPattern dialect treats these as metacharacters (backslash is NOT an escape
 * character in that dialect — see the GlobPattern docs). A basename containing any of them can't
 * be searched for literally via findFiles, so the findByBasename rung is skipped for such
 * basenames rather than attempting to escape them (which would either fail to prevent glob
 * injection or break literal basenames that legitimately contain these characters).
 */
const GLOB_METACHARS = /[*?[\]{}!]/

export async function resolveFileRef(refPath: string, f: Finder): Promise<Resolution> {
  const clean = refPath.replace(/^~\//, '')
  if (clean.startsWith('/') && (await f.exists(clean))) return { result: 'found', path: clean }
  if (!clean.startsWith('/')) {
    for (const folder of f.workspaceFolders()) {
      const abs = `${folder.path}/${clean}`
      if (await f.exists(abs)) return { result: 'found', path: abs }
    }
  }
  const basename = clean.split('/').pop() ?? clean
  if (GLOB_METACHARS.test(basename)) return { result: 'none' }
  const suffix = clean.startsWith('/') ? basename : clean
  const candidates = (await f.findByBasename(basename)).filter((p) => p.endsWith(`/${suffix}`) || p === suffix)
  if (candidates.length === 1) return { result: 'found', path: candidates[0] }
  if (candidates.length > 1) return { result: 'ambiguous', candidates }
  return { result: 'none' }
}

import * as path from 'node:path'

/** True when `absPath` is not inside any of `folderPaths` (posix `..` resolved first).
 *  Used to gate a confirmation prompt before opening files outside the workspace,
 *  since chat refs and deep links are untrusted input. No open folder → outside. */
export function isPathOutsideWorkspace(absPath: string, folderPaths: string[]): boolean {
  if (folderPaths.length === 0) return true
  const norm = absPath.startsWith('/') ? path.posix.normalize(absPath) : absPath
  return !folderPaths.some((f) => norm === f || norm.startsWith(f.endsWith('/') ? f : f + '/'))
}
