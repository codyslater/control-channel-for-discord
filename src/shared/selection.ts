/** Where to land inside a document. 1-based, all optional; `cell` is a notebook
 * cell index and makes line/col cell-relative (see shared/uri.ts OpenParams). */
export interface OpenAt {
  line?: number
  col?: number
  endLine?: number
  endCol?: number
  cell?: number
}

/** 0-based editor selection. `ch: Number.MAX_SAFE_INTEGER` means end-of-line —
 * callers pass the result through document.validateRange, which clamps it. */
export interface NormalizedSelection {
  start: { line: number; ch: number }
  end: { line: number; ch: number }
}

export function normalizeSelection(at: OpenAt): NormalizedSelection {
  const start = { line: Math.max(0, (at.line ?? 1) - 1), ch: Math.max(0, (at.col ?? 1) - 1) }
  const end =
    at.endLine !== undefined
      ? {
          line: Math.max(0, at.endLine - 1),
          ch: at.endCol !== undefined ? Math.max(0, at.endCol - 1) : Number.MAX_SAFE_INTEGER,
        }
      : { ...start }
  const inOrder = start.line < end.line || (start.line === end.line && start.ch <= end.ch)
  return inOrder ? { start, end } : { start: end, end: start }
}

/** 1-based link cell index → 0-based notebook index, clamped to the notebook. */
export function clampCellIndex(cell1based: number, cellCount: number): number {
  return Math.min(Math.max(1, cell1based), Math.max(1, cellCount)) - 1
}
