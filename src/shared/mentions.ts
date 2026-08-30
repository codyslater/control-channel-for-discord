import { Mentionable, MentionKind, MentionRef, MentionSend } from './types'

/** The `@query` the caret is currently inside, or null. Requires a boundary
 *  (start of text or whitespace) before the `@` so emails don't trigger. */
export function mentionQueryAtCaret(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const m = /(?:^|\s)@([^\s@]*)$/.exec(before)
  if (!m) return null
  return { start: before.length - m[1].length - 1, query: m[1] }
}

/** Members matching `query`, best first: name prefix, username prefix, name
 *  substring, username substring; alphabetical by name within a rank. */
export function rankMembers(query: string, items: Mentionable[]): Mentionable[] {
  const q = query.toLowerCase()
  const rank = (x: Mentionable): number => {
    if (!q) return 0
    const name = x.name.toLowerCase()
    const user = (x.username ?? '').toLowerCase()
    if (name.startsWith(q)) return 0
    if (user.startsWith(q)) return 1
    if (name.includes(q)) return 2
    if (user.includes(q)) return 3
    return -1
  }
  return items
    .map((x) => ({ x, r: rank(x) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r || a.x.name.localeCompare(b.x.name))
    .map(({ x }) => x)
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Rewrites each picked `@Name` (whole word, longest names first) to `<@id>`.
 *  Names never picked stay literal. */
export function serializeMentions(
  text: string, picked: Map<string, Mentionable>,
): { content: string; mentions: MentionSend[] } {
  const seen = new Map<string, MentionSend>()
  let content = text
  const names = [...picked.keys()].sort((a, b) => b.length - a.length)
  for (const name of names) {
    const who = picked.get(name)!
    const re = new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRe(name)}(?![\\p{L}\\p{N}_])`, 'gu')
    content = content.replace(re, (_all, lead: string) => {
      seen.set(who.id, { id: who.id, kind: who.kind })
      return `${lead}<@${who.id}>`
    })
  }
  return { content, mentions: [...seen.values()] }
}

/** Splits rendered text around mention tokens so the renderer can wrap them. */
export function splitMentions(text: string, mentions: MentionRef[]): (string | MentionRef)[] {
  const out: (string | MentionRef)[] = []
  const re = /<@[!&]?(\d+)>/g
  let pos = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > pos) out.push(text.slice(pos, m.index))
    const id = m[1]
    out.push(mentions.find((r) => r.id === id) ?? { id, name: 'unknown', kind: 'user' })
    pos = m.index + m[0].length
  }
  if (pos < text.length) out.push(text.slice(pos))
  return out
}

/** Sends stay @silent unless a human was mentioned; bots get mentions regardless. */
export function isSilentSend(mentions: { kind: MentionKind }[]): boolean {
  return !mentions.some((m) => m.kind === 'user')
}
