import { describe, expect, it } from 'vitest'
import { isPathOutsideWorkspace } from './resolve'

describe('isPathOutsideWorkspace', () => {
  const ws = ['/home/dev/repo']
  it('treats paths inside a workspace folder as inside', () => {
    expect(isPathOutsideWorkspace('/home/dev/repo/src/a.ts', ws)).toBe(false)
    expect(isPathOutsideWorkspace('/home/dev/repo', ws)).toBe(false)
  })
  it('flags absolute paths outside the workspace', () => {
    expect(isPathOutsideWorkspace('/etc/passwd', ws)).toBe(true)
    expect(isPathOutsideWorkspace('/home/dev/repo-evil/x', ws)).toBe(true) // prefix but not a segment boundary
  })
  it('resolves .. before checking, so traversal escapes are caught', () => {
    expect(isPathOutsideWorkspace('/home/dev/repo/../../../../etc/passwd', ws)).toBe(true)
    expect(isPathOutsideWorkspace('/home/dev/repo/sub/../src/a.ts', ws)).toBe(false)
  })
  it('with no workspace open, everything is outside', () => {
    expect(isPathOutsideWorkspace('/anything', [])).toBe(true)
  })
})
