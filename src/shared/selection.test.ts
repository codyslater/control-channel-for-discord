import { describe, expect, test } from 'vitest'
import { clampCellIndex, normalizeSelection } from './selection'

describe('normalizeSelection', () => {
  test('no line → caret at 0,0', () => {
    expect(normalizeSelection({})).toEqual({ start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 } })
  })
  test('point: 1-based line/col → 0-based caret', () => {
    expect(normalizeSelection({ line: 12, col: 5 })).toEqual({ start: { line: 11, ch: 4 }, end: { line: 11, ch: 4 } })
  })
  test('line range without cols selects whole lines (end ch = MAX, validateRange clamps)', () => {
    expect(normalizeSelection({ line: 3, endLine: 7 })).toEqual({
      start: { line: 2, ch: 0 },
      end: { line: 6, ch: Number.MAX_SAFE_INTEGER },
    })
  })
  test('full range with cols', () => {
    expect(normalizeSelection({ line: 12, col: 5, endLine: 34, endCol: 8 })).toEqual({
      start: { line: 11, ch: 4 },
      end: { line: 33, ch: 7 },
    })
  })
  test('inverted range is swapped, not errored', () => {
    expect(normalizeSelection({ line: 34, endLine: 12 })).toEqual({
      start: { line: 11, ch: Number.MAX_SAFE_INTEGER },
      end: { line: 33, ch: 0 },
    })
  })
  test('zero/garbage floors at 0', () => {
    expect(normalizeSelection({ line: 0, col: 0 })).toEqual({ start: { line: 0, ch: 0 }, end: { line: 0, ch: 0 } })
  })
})

describe('clampCellIndex', () => {
  test('clamps into [1, cellCount] and converts to 0-based', () => {
    expect(clampCellIndex(5, 10)).toBe(4)
    expect(clampCellIndex(0, 10)).toBe(0)
    expect(clampCellIndex(99, 3)).toBe(2)
    expect(clampCellIndex(1, 0)).toBe(0) // empty notebook: index 0, caller's cellAt clamps too
  })
})
