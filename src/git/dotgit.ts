export interface FsReader {
  readFile(absPath: string): Promise<string | null>
  readDir(absPath: string): Promise<string[]>
}

export interface GitInfo {
  branch: string | null
  isWorktree: boolean
  gitDir: string | null
  commonDir: string | null
}

function dirname(p: string): string {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

function resolveRel(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel
  const parts = base.split('/').filter(Boolean)
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.' && seg !== '') parts.push(seg)
  }
  return '/' + parts.join('/')
}

function branchFromHead(head: string | null): string | null {
  const m = head?.match(/^ref: refs\/heads\/(.+)$/m)
  return m ? m[1].trim() : null
}

// Conservative allowlist consistent with `git check-ref-format --branch` semantics.
// Rejects anything that could be interpreted as shell metacharacters, since callers
// may interpolate the result into a terminal command string.
const BRANCH_NAME_ALLOWED = /^[A-Za-z0-9._/-]+$/

export function isValidBranchName(name: string): boolean {
  if (!name) return false
  if (!BRANCH_NAME_ALLOWED.test(name)) return false
  if (name.startsWith('-') || name.startsWith('/') || name.startsWith('.')) return false
  if (name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false
  if (name.includes('..') || name.includes('//')) return false
  return true
}

export async function readGitInfo(folder: string, fs: FsReader): Promise<GitInfo> {
  const dotGit = `${folder}/.git`
  const fileContent = await fs.readFile(dotGit)
  let gitDir: string
  let isWorktree = false
  if (fileContent === null) {
    // .git is a directory (normal repo) — or absent
    const head = await fs.readFile(`${dotGit}/HEAD`)
    if (head === null) return { branch: null, isWorktree: false, gitDir: null, commonDir: null }
    return { branch: branchFromHead(head), isWorktree: false, gitDir: dotGit, commonDir: dotGit }
  }
  const m = fileContent.match(/^gitdir:\s*(.+)$/m)
  if (!m) return { branch: null, isWorktree: false, gitDir: null, commonDir: null }
  gitDir = resolveRel(folder, m[1].trim())
  isWorktree = true
  const head = await fs.readFile(`${gitDir}/HEAD`)
  const commonRaw = (await fs.readFile(`${gitDir}/commondir`))?.trim()
  const commonDir = commonRaw ? resolveRel(gitDir, commonRaw) : gitDir
  return { branch: branchFromHead(head), isWorktree, gitDir, commonDir }
}

export async function findWorktreeForBranch(
  commonDir: string,
  branch: string,
  fs: FsReader,
): Promise<string | null> {
  // Main worktree: HEAD sits directly in the common dir; its folder is the parent of .git.
  if (branchFromHead(await fs.readFile(`${commonDir}/HEAD`)) === branch) {
    return commonDir.endsWith('/.git') ? dirname(commonDir) : null
  }
  for (const name of await fs.readDir(`${commonDir}/worktrees`)) {
    const wtGit = `${commonDir}/worktrees/${name}`
    if (branchFromHead(await fs.readFile(`${wtGit}/HEAD`)) !== branch) continue
    const gitdirFile = (await fs.readFile(`${wtGit}/gitdir`))?.trim()
    if (gitdirFile?.endsWith('/.git')) return dirname(gitdirFile)
  }
  return null
}
