import { describe, expect, it } from 'vitest'
import { formatSnippet } from './snippet'

const base = { rest: '', refLine: 'src/a.ts:3-7', languageId: 'typescript', code: 'const x = 1' }

describe('formatSnippet', () => {
  it('formats ref line + fenced code without rest', () => {
    expect(formatSnippet(base)).toBe('src/a.ts:3-7\n```typescript\nconst x = 1\n```')
  })
  it('puts rest text first when present', () => {
    expect(formatSnippet({ ...base, rest: 'look here' })).toBe('look here\nsrc/a.ts:3-7\n```typescript\nconst x = 1\n```')
  })
  it('lengthens the fence when code contains backtick fences', () => {
    const out = formatSnippet({ ...base, code: 'a\n```\nb' })
    expect(out).toContain('````typescript')
    expect(out.endsWith('````')).toBe(true)
  })
  it('truncates to fit the 2000-char Discord limit', () => {
    const out = formatSnippet({ ...base, code: 'x'.repeat(5000) })
    expect(out.length).toBeLessThanOrEqual(2000)
    expect(out).toContain('… (truncated)')
  })
  it('keeps short messages untruncated', () => {
    expect(formatSnippet(base)).not.toContain('truncated')
  })
  it('bounds output when rest alone is huge', () => {
    const out = formatSnippet({ ...base, rest: 'r'.repeat(5000) })
    expect(out.length).toBeLessThanOrEqual(2000)
    expect(out).toContain('… (truncated)')
  })
  it('bounds output when rest and code are both huge', () => {
    const out = formatSnippet({ ...base, rest: 'r'.repeat(5000), code: 'c'.repeat(5000) })
    expect(out.length).toBeLessThanOrEqual(2000)
  })
  it('bounds output for a pathological refLine', () => {
    const out = formatSnippet({ ...base, refLine: 'p'.repeat(5000) })
    expect(out.length).toBeLessThanOrEqual(2000)
  })
})
