import { describe, expect, test } from 'vitest'
import { buildSnippetRef } from './snippetRef'

const base = { languageId: 'python', code: 'x = 1' }

describe('buildSnippetRef', () => {
  test('single line, workspace-relative', () => {
    expect(buildSnippetRef({ ...base, path: '/home/dev/repo/src/train.py', folderPath: '/home/dev/repo', startLine: 12, endLine: 12 }))
      .toEqual({ refLine: 'src/train.py:12', languageId: 'python', code: 'x = 1' })
  })
  test('multi-line range', () => {
    expect(buildSnippetRef({ ...base, path: '/home/dev/repo/src/train.py', folderPath: '/home/dev/repo', startLine: 12, endLine: 34 }).refLine)
      .toBe('src/train.py:12-34')
  })
  test('notebook cell', () => {
    expect(buildSnippetRef({ ...base, path: '/home/dev/repo/eval.ipynb', folderPath: '/home/dev/repo', startLine: 3, endLine: 7, cell: 5 }).refLine)
      .toBe('eval.ipynb#5:3-7')
    expect(buildSnippetRef({ ...base, path: '/home/dev/repo/eval.ipynb', folderPath: '/home/dev/repo', startLine: 3, endLine: 3, cell: 5 }).refLine)
      .toBe('eval.ipynb#5:3')
  })
  test('no folder → absolute path', () => {
    expect(buildSnippetRef({ ...base, path: '/etc/hosts.py', startLine: 1, endLine: 1 }).refLine).toBe('/etc/hosts.py:1')
  })
  test('path-boundary: sibling folder with shared prefix stays absolute', () => {
    // '/a/bc/x.py'.startsWith('/a/b') is true — a bare prefix check would emit 'c/x.py'.
    expect(buildSnippetRef({ ...base, path: '/a/bc/x.py', folderPath: '/a/b', startLine: 1, endLine: 1 }).refLine)
      .toBe('/a/bc/x.py:1')
  })
})
