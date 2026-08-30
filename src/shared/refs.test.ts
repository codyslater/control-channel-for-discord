import { describe, expect, test } from 'vitest'
import { extractRefs } from './refs'

const refs = (t: string) => extractRefs(t).map((s) => s.ref)
const texts = (t: string) => extractRefs(t).map((s) => t.slice(s.start, s.end))

describe('file paths', () => {
  test('relative path with line', () => {
    expect(refs('see src/train.py:142 for the bug')).toEqual([{ kind: 'file', path: 'src/train.py', line: 142 }])
    expect(texts('see src/train.py:142 for the bug')).toEqual(['src/train.py:142'])
  })
  test('absolute path, no line', () => {
    expect(refs('/home/dev/repo/src/model.rs is done')).toEqual([{ kind: 'file', path: '/home/dev/repo/src/model.rs' }])
  })
  test('bare filename with source extension', () => {
    expect(refs('run train.py again')).toEqual([{ kind: 'file', path: 'train.py' }])
  })
  test('notebook path', () => {
    expect(refs('results in notebooks/eval.ipynb')).toEqual([{ kind: 'file', path: 'notebooks/eval.ipynb' }])
  })
  test('multi-segment path without extension needs a line number', () => {
    expect(refs('in foo/bar we do X')).toEqual([])
    expect(refs('crash at foo/bar:12')).toEqual([{ kind: 'file', path: 'foo/bar', line: 12 }])
  })
  test('version numbers are not files', () => {
    expect(refs('upgrade to 1.2.3 now')).toEqual([])
  })
})

describe('tracebacks', () => {
  test('python frame', () => {
    expect(refs('  File "/app/src/train.py", line 88, in step')).toEqual([
      { kind: 'file', path: '/app/src/train.py', line: 88 },
    ])
  })
  test('js stack frame with column', () => {
    expect(refs('    at run (/app/src/index.js:10:5)')).toEqual([
      { kind: 'file', path: '/app/src/index.js', line: 10, col: 5 },
    ])
  })
})

describe('shas', () => {
  test('7-40 hex with at least one letter', () => {
    expect(refs('fixed in deadbee')).toEqual([{ kind: 'sha', sha: 'deadbee' }])
    expect(refs('see 1234567')).toEqual([]) // digits only — not a sha
    expect(refs('id 12ab last')).toEqual([]) // too short
  })
})

describe('deep links and urls', () => {
  test('raw vscode:// open link', () => {
    const t = 'jump: vscode://c0d3s.control-channel-for-discord/open?host=gpubox&folder=%2Fr&file=a.py&line=3'
    expect(refs(t)).toEqual([{ kind: 'deeplink', params: { host: 'gpubox', folder: '/r', file: 'a.py', line: 3 } }])
  })
  test('vscode.dev redirect unwraps', () => {
    const inner = encodeURIComponent('vscode://c0d3s.control-channel-for-discord/open?file=a.py')
    expect(refs(`go https://vscode.dev/redirect?url=${inner} now`)).toEqual([
      { kind: 'deeplink', params: { file: 'a.py' } },
    ])
  })
  test('paths inside ordinary urls are ignored', () => {
    expect(refs('docs at https://example.com/a/b.py?x=1')).toEqual([])
  })
  test('raw fork-scheme open links (cursor, windsurf, vscodium)', () => {
    expect(refs('jump: cursor://c0d3s.control-channel-for-discord/open?file=a.py')).toEqual([
      { kind: 'deeplink', params: { file: 'a.py' } },
    ])
    expect(refs('jump: windsurf://c0d3s.control-channel-for-discord/open?file=a.py')).toEqual([
      { kind: 'deeplink', params: { file: 'a.py' } },
    ])
    expect(refs('jump: vscodium://c0d3s.control-channel-for-discord/open?file=a.py')).toEqual([
      { kind: 'deeplink', params: { file: 'a.py' } },
    ])
  })
})

describe('overlaps', () => {
  test('traceback wins over bare path+sha inside it; spans are ordered and disjoint', () => {
    const t = 'File "/a/b.py", line 3 and also deadbee plus src/x.ts:9'
    const spans = extractRefs(t)
    expect(spans.map((s) => s.ref.kind)).toEqual(['file', 'sha', 'file'])
    for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end)
  })
})

describe('ranges and notebook cells', () => {
  test('line range (what /snippet emits)', () => {
    expect(refs('see src/train.py:12-34')).toEqual([{ kind: 'file', path: 'src/train.py', line: 12, endLine: 34 }])
    expect(texts('see src/train.py:12-34')).toEqual(['src/train.py:12-34'])
  })
  test('full range with columns', () => {
    expect(refs('src/a.ts:12:5-34:8')).toEqual([{ kind: 'file', path: 'src/a.ts', line: 12, col: 5, endLine: 34, endCol: 8 }])
  })
  test('range with endCol but no start col', () => {
    expect(refs('src/a.ts:12-34:9')).toEqual([{ kind: 'file', path: 'src/a.ts', line: 12, endLine: 34, endCol: 9 }])
  })
  test('dash not followed by digits is not a range', () => {
    expect(refs('src/a.ts:12-rc1')).toEqual([{ kind: 'file', path: 'src/a.ts', line: 12 }])
    expect(texts('src/a.ts:12-rc1')).toEqual(['src/a.ts:12'])
  })
  test('notebook cell refs', () => {
    expect(refs('bug in eval.ipynb#5:3-7')).toEqual([{ kind: 'file', path: 'eval.ipynb', cell: 5, line: 3, endLine: 7 }])
    expect(refs('eval.ipynb#5:3')).toEqual([{ kind: 'file', path: 'eval.ipynb', cell: 5, line: 3 }])
    expect(refs('eval.ipynb#5')).toEqual([{ kind: 'file', path: 'eval.ipynb', cell: 5 }])
    expect(texts('bug in eval.ipynb#5:3-7')).toEqual(['eval.ipynb#5:3-7'])
  })
  test('JS traceback regex does not catastrophically backtrack on long space runs (ReDoS guard)', () => {
    const poison = 'at ' + ' '.repeat(4000) + 'x'
    const t = Date.now()
    expect(refs(poison)).toEqual([])
    expect(Date.now() - t).toBeLessThan(100)
  })
  test('still extracts real JS stack frames', () => {
    expect(refs('at Object.<anonymous> (/home/x/app.js:10:15)')).toEqual([{ kind: 'file', path: '/home/x/app.js', line: 10, col: 15 }])
    expect(refs('at async Foo.bar (./src/a.ts:3:4)')).toEqual([{ kind: 'file', path: './src/a.ts', line: 3, col: 4 }])
  })
  test('#n on a non-notebook path ends the ref at the path', () => {
    expect(refs('see notes.md#12')).toEqual([{ kind: 'file', path: 'notes.md' }])
    expect(texts('see notes.md#12')).toEqual(['notes.md'])
    expect(refs('in foo/bar#12 we do X')).toEqual([]) // multi-segment, no ext, no line — still not a ref
  })
})
