import { ChatMessage } from './types'

export const GROUP_WINDOW_MS = 5 * 60 * 1000

/** Whether `m` renders as a continuation of `prev` — no header, no avatar. */
export function isContinuation(prev: ChatMessage | undefined, m: ChatMessage): boolean {
  if (!prev) return false
  return (
    prev.authorName === m.authorName &&
    prev.isApp === m.isApp &&
    m.createdAt - prev.createdAt < GROUP_WINDOW_MS &&
    sameDay(prev.createdAt, m.createdAt)
  )
}

/** Whether a day divider belongs between `prev` and `m` (local time). */
export function needsDayDivider(prev: ChatMessage | undefined, m: ChatMessage): boolean {
  if (!prev) return false
  return !sameDay(prev.createdAt, m.createdAt)
}

export function sameDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

export function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
}
