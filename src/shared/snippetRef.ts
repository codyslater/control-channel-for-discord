export interface SnippetSource {
  /** Absolute document path — for notebook cells, the .ipynb path, not the cell URI. */
  path: string
  /** Workspace folder containing it, when known — refs prefer folder-relative paths. */
  folderPath?: string
  /** 1-based selection lines (cell-relative in a notebook cell). */
  startLine: number
  endLine: number
  languageId: string
  code: string
  /** 1-based cell index when the selection lives in a notebook cell. */
  cell?: number
}

/** Builds the clickable ref line for /snippet: `src/a.ts:12`, `src/a.ts:12-34`,
 * or `eval.ipynb#5:3-7` — the exact shapes shared/refs.ts parses back. */
export function buildSnippetRef(s: SnippetSource): { refLine: string; languageId: string; code: string } {
  // '/' boundary required: '/a/bc'.startsWith('/a/b') must NOT make the path relative.
  const rel =
    s.folderPath && s.path.startsWith(s.folderPath + '/')
      ? s.path.slice(s.folderPath.length + 1)
      : s.path
  const target = s.cell !== undefined ? `${rel}#${s.cell}` : rel
  const lines = s.endLine !== s.startLine ? `${s.startLine}-${s.endLine}` : `${s.startLine}`
  return { refLine: `${target}:${lines}`, languageId: s.languageId, code: s.code }
}
