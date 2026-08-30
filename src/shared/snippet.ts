const LIMIT = 2000
const TRUNCATION_MARK = '\n… (truncated)'

/** Builds the /snippet message body: optional user text, a clickable ref line,
 *  then a fenced code block. Output is always ≤ 2000 chars (Discord rejects
 *  anything longer): code truncates first, then rest, with a hard clip as the
 *  last resort for pathological refLine inputs. */
export function formatSnippet(s: { rest: string; refLine: string; languageId: string; code: string }): string {
  const fence = pickFence(s.code)
  const build = (rest: string, body: string) =>
    (rest ? rest + '\n' : '') + s.refLine + '\n' + fence + s.languageId + '\n' + body + '\n' + fence
  const full = build(s.rest, s.code)
  if (full.length <= LIMIT) return full
  // 1: truncate code
  const overhead = build(s.rest, '').length + TRUNCATION_MARK.length
  if (overhead <= LIMIT) return build(s.rest, s.code.slice(0, LIMIT - overhead) + TRUNCATION_MARK)
  // 2: head alone is too big — truncate rest, keep a marker-only code block
  const markerBody = TRUNCATION_MARK.trimStart()
  const fixedLen = build('', markerBody).length + 1 // +1 for the newline after rest
  const restKeep = Math.max(0, LIMIT - fixedLen - TRUNCATION_MARK.length)
  const clipped = build(s.rest.slice(0, restKeep) + TRUNCATION_MARK, markerBody)
  // 3: pathological refLine (longer than the whole limit) — hard clip; such a
  // ref is not a real workspace path and Discord would reject it anyway.
  return clipped.length <= LIMIT ? clipped : clipped.slice(0, LIMIT)
}

function pickFence(code: string): string {
  let fence = '```'
  while (code.includes(fence)) fence += '`'
  return fence
}
