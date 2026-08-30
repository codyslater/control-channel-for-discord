import { describe, expect, it } from 'vitest'
import { diffStat, formatDiffStat } from './diffStat'

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts',
  'index 111..222 100644',
  '--- a/src/a.ts',
  '+++ b/src/a.ts',
  '@@ -1,2 +1,3 @@',
  ' unchanged',
  '+added line',
  '+another add',
  '-removed line',
  'diff --git a/img.png b/img.png',
  'Binary files a/img.png and b/img.png differ',
  'diff --git a/old.ts b/new.ts',
  'rename from old.ts',
  'rename to new.ts',
].join('\n')

describe('diffStat', () => {
  it('counts adds and dels per file', () => {
    const [a] = diffStat(DIFF)
    expect(a).toEqual({ path: 'src/a.ts', adds: 2, dels: 1, binary: false })
  })
  it('marks binary files', () => {
    expect(diffStat(DIFF)[1]).toEqual({ path: 'img.png', adds: 0, dels: 0, binary: true })
  })
  it('uses the rename target as the path', () => {
    expect(diffStat(DIFF)[2].path).toBe('new.ts')
  })
  it('does not count +++/--- header lines', () => {
    expect(diffStat(DIFF)[0].adds).toBe(2)
  })
  it('returns [] for an empty diff', () => {
    expect(diffStat('')).toEqual([])
  })
  it('counts deleted lines that begin with -- (SQL-style comments)', () => {
    // Old file has 2 lines: an unchanged "-- kept comment" (context, leading
    // space is the diff marker) and a deleted "-- removed comment", which in
    // unified diff form is prefixed with a deletion marker: "--- removed comment".
    const d = 'diff --git a/q.sql b/q.sql\n--- a/q.sql\n+++ b/q.sql\n@@ -1,2 +1,1 @@\n -- kept comment\n--- removed comment\n'
    expect(diffStat(d)[0].dels).toBe(1)
  })
  it('counts added lines that begin with ++ (content "++ x")', () => {
    // An added line whose content is "++ x" is prefixed with an addition
    // marker in unified diff form, producing the literal text "+++ x" —
    // which must still count as one add, not be mistaken for a file header.
    const d = 'diff --git a/c.cpp b/c.cpp\n--- a/c.cpp\n+++ b/c.cpp\n@@ -1,1 +1,2 @@\n context\n+++ x\n'
    expect(diffStat(d)[0].adds).toBe(1)
  })
  it('still excludes real ---/+++ headers from counts', () => {
    const d = 'diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\n'
    expect(diffStat(d)[0]).toEqual({ path: 'a.ts', adds: 1, dels: 1, binary: false })
  })
})

describe('formatDiffStat', () => {
  it('renders one line per file plus totals in a fence', () => {
    const out = formatDiffStat('', diffStat(DIFF))
    expect(out).toContain('src/a.ts | +2 -1')
    expect(out).toContain('img.png | bin')
    expect(out).toContain('3 files, +2 -1')
    expect(out.startsWith('```')).toBe(true)
  })
  it('puts rest text first when present', () => {
    expect(formatDiffStat('wip', diffStat(DIFF)).startsWith('wip\n```')).toBe(true)
  })
  it('truncates long file lists to fit 2000 chars', () => {
    const many = Array.from({ length: 200 }, (_, i) => `diff --git a/f${i}.ts b/f${i}.ts\n+++ b/f${i}.ts\n+x`).join('\n')
    const out = formatDiffStat('', diffStat(many))
    expect(out.length).toBeLessThanOrEqual(2000)
    expect(out).toContain('more files')
  })
  it('bounds output when rest alone is huge', () => {
    const out = formatDiffStat('r'.repeat(5000), diffStat(DIFF))
    expect(out.length).toBeLessThanOrEqual(2000)
  })
  it('bounds output for a single pathological path', () => {
    const one = `diff --git a/${'p'.repeat(4000)} b/${'p'.repeat(4000)}\n+x`
    expect(formatDiffStat('', diffStat(one)).length).toBeLessThanOrEqual(2000)
  })
})
