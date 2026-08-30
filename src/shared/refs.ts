import { EDITOR_SCHEMES, isEditorUri, OpenParams, parseOpenUri, unwrapRedirect } from './uri'

export type Ref =
  | { kind: 'file'; path: string; line?: number; col?: number; endLine?: number; endCol?: number; cell?: number }
  | { kind: 'sha'; sha: string }
  | { kind: 'deeplink'; params: OpenParams }

export interface RefSpan {
  start: number
  end: number
  ref: Ref
}

const SOURCE_EXTS =
  'py|ipynb|ts|tsx|js|jsx|mjs|cjs|rs|go|java|kt|c|h|cc|cpp|hpp|cs|rb|php|md|json|yaml|yml|toml|cfg|ini|sh|bash|zsh|sql|css|scss|html|vue|svelte|txt|log'

const URL_RE = new RegExp(String.raw`(?:https?|${EDITOR_SCHEMES.join('|')}):\/\/[^\s<>"')]+`, 'g')
const PY_TB_RE = /File "([^"]+)", line (\d+)/g
// The optional function-name segment is space-separated tokens (each a non-space
// run), NOT a class that itself includes space — otherwise `[... ]+\s+` backtracks
// catastrophically on long space runs (ReDoS; see refs.test.ts guard).
const JS_TB_RE = /\bat\s+(?:[\w$.<>\[\]]+(?: [\w$.<>\[\]]+)*\s+)?\(?((?:\/|[A-Za-z]:\\|\.{1,2}\/)[^():\s]+):(\d+):(\d+)\)?/g
// path: multi-segment (needs dot in last segment OR :line), or bare filename with a known
// source extension; then optional `#cell` (notebooks) and `:line[:col][-endLine[:endCol]]`.
const FILE_RE = new RegExp(
  String.raw`(?<![\w@/\\.])(` +
    String.raw`(?:~?/)?[\w.\-]+(?:/[\w.\-]+)+` + // multi-segment
    String.raw`|[\w\-]+\.(?:${SOURCE_EXTS})` + // bare filename w/ source ext
    String.raw`)(?:#(\d+))?(?::(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?)?`,
  'g',
)
const SHA_RE = /\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g

interface Cand extends RefSpan {
  prio: number // lower wins on overlap
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end
}

export function extractRefs(text: string): RefSpan[] {
  const cands: Cand[] = []

  // 1. URLs first: deep links become candidates; other URLs become exclusion zones.
  const urlZones: { start: number; end: number }[] = []
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0]
    const inner = isEditorUri(raw) ? raw : (unwrapRedirect(raw) ?? '')
    const params = inner ? parseOpenUri(inner) : null
    if (params) {
      cands.push({ start: m.index, end: m.index + raw.length, ref: { kind: 'deeplink', params }, prio: 0 })
    }
    urlZones.push({ start: m.index, end: m.index + raw.length })
  }

  for (const m of text.matchAll(PY_TB_RE)) {
    cands.push({
      start: m.index,
      end: m.index + m[0].length,
      ref: { kind: 'file', path: m[1], line: Number(m[2]) },
      prio: 1,
    })
  }
  for (const m of text.matchAll(JS_TB_RE)) {
    const start = m.index + m[0].indexOf(m[1])
    cands.push({
      start,
      end: m.index + m[0].length,
      ref: { kind: 'file', path: m[1], line: Number(m[2]), col: Number(m[3]) },
      prio: 1,
    })
  }
  for (const m of text.matchAll(FILE_RE)) {
    const [full, path, cell, line, col, endLine, endCol] = m
    const multiSegment = path.includes('/')
    const lastSegment = path.split('/').pop() ?? ''
    if (multiSegment && !lastSegment.includes('.') && !line) continue
    // `#n` is cell addressing, defined for notebooks only. On any other path the
    // ref ends at the path itself — nothing after '#' is taken as line/col.
    if (cell && !path.endsWith('.ipynb')) {
      cands.push({ start: m.index, end: m.index + path.length, ref: { kind: 'file', path }, prio: 2 })
      continue
    }
    const ref: Ref = { kind: 'file', path }
    if (cell) ref.cell = Number(cell)
    if (line) {
      ref.line = Number(line)
      if (col) ref.col = Number(col)
      if (endLine) {
        ref.endLine = Number(endLine)
        if (endCol) ref.endCol = Number(endCol)
      }
    }
    cands.push({ start: m.index, end: m.index + full.length, ref, prio: 2 })
  }
  for (const m of text.matchAll(SHA_RE)) {
    cands.push({ start: m.index, end: m.index + m[0].length, ref: { kind: 'sha', sha: m[0] }, prio: 3 })
  }

  // Drop candidates inside URL zones (deep links carry prio 0 and identical spans, so they survive).
  const filtered = cands.filter(
    (c) => c.prio === 0 || !urlZones.some((z) => overlaps(c, z)),
  )
  // Resolve overlaps: lower prio wins, then earlier start, then longer span.
  filtered.sort((a, b) => a.prio - b.prio || a.start - b.start || b.end - a.end)
  const kept: Cand[] = []
  for (const c of filtered) {
    if (!kept.some((k) => overlaps(k, c))) kept.push(c)
  }
  kept.sort((a, b) => a.start - b.start)
  return kept.map(({ start, end, ref }) => ({ start, end, ref }))
}
