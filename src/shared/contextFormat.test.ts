import { describe, expect, test } from 'vitest'
import { formatContext } from './contextFormat'

describe('formatContext', () => {
  test('full ssh context with deep link', () => {
    const out = formatContext({
      host: 'gpubox', remoteKind: 'ssh', repo: 'myrepo', isWorktree: true,
      folderPath: '/home/dev/myrepo-wt/fix-auth', file: 'src/train.py', line: 142, endLine: 160, branch: 'fix-auth',
    })
    const [line1, line2] = out.split('\n')
    expect(line1).toBe('📍 gpubox (ssh) · myrepo (worktree) · src/train.py:142-160 · fix-auth')
    expect(line2).toMatch(/^\[open\]\(https:\/\/vscode\.dev\/redirect\?url=vscode%3A%2F%2F/)
    // Values are URLSearchParams-encoded inside the URI, then the whole URI is
    // encodeURIComponent-wrapped for the redirect — so decode twice.
    const inner = decodeURIComponent(decodeURIComponent(line2))
    expect(inner).toContain('host=gpubox')
    expect(inner).toContain('file=src/train.py')
  })
  test('local minimal: no file, no git', () => {
    expect(formatContext({ host: 'thinkpad', remoteKind: 'local' })).toBe('📍 thinkpad')
  })
  test('single line, no worktree, no deep link without folderPath', () => {
    const out = formatContext({ host: 'thinkpad', remoteKind: 'local', repo: 'r', file: 'a.py', line: 3, branch: 'main' })
    expect(out).toBe('📍 thinkpad · r · a.py:3 · main')
  })
})
