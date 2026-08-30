import { describe, expect, test, vi } from 'vitest'
import { Finder, resolveFileRef } from './resolve'

function finder(existing: string[], searchable: string[] = existing): Finder {
  return {
    exists: async (p) => existing.includes(p),
    workspaceFolders: () => [{ name: 'repo', path: '/ws/repo' }, { name: 'lib', path: '/ws/lib' }],
    findByBasename: async (b) => searchable.filter((p) => p.endsWith(`/${b}`)),
  }
}

describe('resolveFileRef', () => {
  test('absolute path that exists', async () => {
    expect(await resolveFileRef('/ws/repo/src/a.py', finder(['/ws/repo/src/a.py'])))
      .toEqual({ result: 'found', path: '/ws/repo/src/a.py' })
  })
  test('workspace-relative, first folder wins', async () => {
    expect(await resolveFileRef('src/a.py', finder(['/ws/repo/src/a.py', '/ws/lib/src/a.py'])))
      .toEqual({ result: 'found', path: '/ws/repo/src/a.py' })
  })
  test('basename search with suffix filter', async () => {
    const f = finder([], ['/ws/repo/deep/nested/train.py'])
    expect(await resolveFileRef('nested/train.py', f)).toEqual({ result: 'found', path: '/ws/repo/deep/nested/train.py' })
  })
  test('ambiguous basename matches', async () => {
    const f = finder([], ['/ws/repo/a/train.py', '/ws/lib/b/train.py'])
    expect(await resolveFileRef('train.py', f)).toEqual({
      result: 'ambiguous', candidates: ['/ws/repo/a/train.py', '/ws/lib/b/train.py'],
    })
  })
  test('suffix filter rejects non-matching candidates', async () => {
    const f = finder([], ['/ws/repo/other/train.py'])
    expect(await resolveFileRef('exp/train.py', f)).toEqual({ result: 'none' })
  })
  test('nothing anywhere', async () => {
    expect(await resolveFileRef('ghost.py', finder([]))).toEqual({ result: 'none' })
  })
  test.each(['*', '?', '[', ']', '{', '}', '!'])(
    'basename containing glob metacharacter %s skips findByBasename and returns none',
    async (ch) => {
      const findByBasename = vi.fn(async () => [])
      const f: Finder = {
        exists: async () => false,
        workspaceFolders: () => [{ name: 'repo', path: '/ws/repo' }],
        findByBasename,
      }
      expect(await resolveFileRef(`weird${ch}name.py`, f)).toEqual({ result: 'none' })
      expect(findByBasename).not.toHaveBeenCalled()
    },
  )
  test('normal basenames untouched by the glob guard still resolve via findByBasename', async () => {
    const f = finder([], ['/ws/repo/deep/nested/train.py'])
    expect(await resolveFileRef('train.py', f)).toEqual({ result: 'found', path: '/ws/repo/deep/nested/train.py' })
  })
})
