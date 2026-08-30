export interface FileStat {
  path: string
  adds: number
  dels: number
  binary: boolean
}

const LIMIT = 2000

/** Parses unified diff text into per-file add/del counts (git diff --stat
 *  equivalent). Counting is hunk-gated: +/- lines only count after a file's
 *  first @@ header, so ---/+++ file headers (and content lines that merely
 *  resemble them) are handled correctly. */
export function diffStat(diff: string): FileStat[] {
  const files: FileStat[] = []
  let cur: FileStat | null = null
  let inHunk = false
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = / b\/(.*)$/.exec(line)
      cur = { path: m ? m[1] : line.slice('diff --git '.length), adds: 0, dels: 0, binary: false }
      files.push(cur)
      inHunk = false
    } else if (!cur) continue
    else if (line.startsWith('@@')) inHunk = true
    else if (!inHunk && line.startsWith('rename to ')) cur.path = line.slice('rename to '.length)
    else if (!inHunk && line.startsWith('Binary files ')) cur.binary = true
    else if (inHunk && line.startsWith('+')) cur.adds++
    else if (inHunk && line.startsWith('-')) cur.dels++
  }
  return files
}

/** Renders stats as a fenced block. Output is always ≤ 2000 chars (Discord
 *  rejects anything longer): the file list truncates first, then rest is
 *  clipped, with a hard clip as the last resort for a pathological path. */
export function formatDiffStat(rest: string, files: FileStat[]): string {
  const totals = `${files.length} file${files.length === 1 ? '' : 's'}, ` +
    `+${files.reduce((n, f) => n + f.adds, 0)} -${files.reduce((n, f) => n + f.dels, 0)}`
  const lines = files.map((f) => (f.binary ? `${f.path} | bin` : `${f.path} | +${f.adds} -${f.dels}`))
  const assemble = (r: string, ls: string[], omitted: number) =>
    (r ? r + '\n' : '') +
    '```\n' + ls.join('\n') + (omitted ? `\n… ${omitted} more files` : '') + '\n' + totals + '\n```'
  let omitted = 0
  let out = assemble(rest, lines, 0)
  while (out.length > LIMIT && lines.length > 1) {
    lines.pop()
    omitted++
    out = assemble(rest, lines, omitted)
  }
  if (out.length > LIMIT) {
    // File list is minimal but still over — clip rest to fit.
    const fixedLen = assemble('', lines, omitted).length + 2 // newline + ellipsis char
    out = assemble(rest.slice(0, Math.max(0, LIMIT - fixedLen)) + '…', lines, omitted)
  }
  // Last resort (single pathological path longer than the limit): hard clip.
  return out.length <= LIMIT ? out : out.slice(0, LIMIT)
}
