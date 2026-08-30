import { ChatMessage } from './types'

export interface ActivityEntry {
  channelId: string
  /** Time of the newest message we know of (live event or seeded from lastMessageId). */
  lastAt: number
  lastAuthor?: string
  lastPreview?: string
  /** Live messages since the channel was last opened here. */
  unread: number
  /** An unread message mentions the user. */
  mentioned: boolean
  /** Seeded recency is newer than the persisted last-read; count unknown. */
  unreadSince: boolean
}

export interface ActivityContext {
  silenced: ReadonlySet<string>
  /** Channels currently open in the sidebar chat, a pop-out, or a dock. */
  watched: ReadonlySet<string>
  ownHookIds: ReadonlySet<string>
  personaName: string
}

/** A message is the user's own when it came through a webhook we resolved, or —
 *  covering the user's other machines using the same vscode-bridge hook — when
 *  it is an APP message under the persona's display name. */
export function isOwnPost(m: ChatMessage, ctx: ActivityContext): boolean {
  if (m.webhookId && ctx.ownHookIds.has(m.webhookId)) return true
  return m.isApp && !!ctx.personaName && m.authorName === ctx.personaName
}

export function shouldTrack(m: ChatMessage, ctx: ActivityContext): boolean {
  if (ctx.silenced.has(m.channelId) || ctx.watched.has(m.channelId)) return false
  return !isOwnPost(m, ctx)
}

export const ACTIVITY_CAP = 30
const PREVIEW_MAX = 60
const DISCORD_EPOCH = 1420070400000

export function snowflakeTime(id: string): number {
  return Number(BigInt(id) >> 22n) + DISCORD_EPOCH
}

/** One-line, human preview of a message for the feed. */
export function previewOf(m: ChatMessage): string {
  let text = m.content
  for (const r of m.mentions ?? []) {
    const token = r.kind === 'role' ? `<@&${r.id}>` : `<@${r.id}>`
    text = text.split(token).join(`@${r.name}`).split(`<@!${r.id}>`).join(`@${r.name}`)
  }
  text = text
    .replace(/```[a-zA-Z0-9_-]*\n?/g, ' ')
    .replace(/[`*_~>#]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) {
    const a = m.attachments[0]
    if (a) return a.isImage ? `[image] ${a.filename}` : `📎 ${a.filename}`
    return ''
  }
  return text.length > PREVIEW_MAX ? text.slice(0, PREVIEW_MAX) + '…' : text
}

function find(list: ActivityEntry[], channelId: string): ActivityEntry | undefined {
  return list.find((e) => e.channelId === channelId)
}
function replace(list: ActivityEntry[], e: ActivityEntry): ActivityEntry[] {
  return [e, ...list.filter((x) => x.channelId !== e.channelId)]
}

/** Every message refreshes recency/preview; only tracked ones count as unread. */
export function applyMessage(
  list: ActivityEntry[], m: ChatMessage, o: { track: boolean; mentionsMe: boolean },
): ActivityEntry[] {
  const prev = find(list, m.channelId) ?? { channelId: m.channelId, lastAt: 0, unread: 0, mentioned: false, unreadSince: false }
  return replace(list, {
    ...prev,
    lastAt: Math.max(prev.lastAt, m.createdAt),
    lastAuthor: m.authorName,
    lastPreview: previewOf(m),
    unread: prev.unread + (o.track ? 1 : 0),
    mentioned: prev.mentioned || (o.track && o.mentionsMe),
  })
}

export function markRead(list: ActivityEntry[], channelId: string): ActivityEntry[] {
  const prev = find(list, channelId)
  if (!prev) return list
  return list.map((e) => (e === prev ? { ...e, unread: 0, mentioned: false, unreadSince: false } : e))
}

/** Merge channel recency (from lastMessageId) into the feed. */
export function seedActivity(
  list: ActivityEntry[], seeds: { channelId: string; lastAt: number }[], lastRead: Record<string, number>,
): ActivityEntry[] {
  let out = list
  for (const s of seeds) {
    const prev = find(out, s.channelId)
    const read = lastRead[s.channelId]
    if (!prev) {
      out = [...out, { channelId: s.channelId, lastAt: s.lastAt, unread: 0, mentioned: false, unreadSince: read !== undefined && s.lastAt > read }]
    } else if (s.lastAt > prev.lastAt) {
      out = out.map((e) => (e === prev
        ? { ...e, lastAt: s.lastAt, lastAuthor: undefined, lastPreview: undefined, unreadSince: read !== undefined && s.lastAt > read }
        : e))
    }
  }
  return out
}

/** Tiers: mentioned, then unread (incl. unreadSince), then read — newest first
 *  within a tier; capped. With a window, read entries older than `windowMs`
 *  drop out; unread / mentioned entries always stay. */
export function rankActivity(list: ActivityEntry[], o?: { now: number; windowMs: number }): ActivityEntry[] {
  const keep = (e: ActivityEntry) =>
    !o || o.windowMs <= 0 || e.unread > 0 || e.mentioned || e.unreadSince || e.lastAt >= o.now - o.windowMs
  const tier = (e: ActivityEntry) => (e.mentioned ? 0 : e.unread > 0 || e.unreadSince ? 1 : 2)
  return list
    .filter(keep)
    .sort((a, b) => tier(a) - tier(b) || b.lastAt - a.lastAt)
    .slice(0, ACTIVITY_CAP)
}

export function unreadTotal(list: ActivityEntry[]): number {
  return list.reduce((n, e) => n + (e.unread || (e.unreadSince ? 1 : 0)), 0)
}

export function relativeTime(now: number, at: number): string {
  const s = Math.max(0, now - at) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / (7 * 86400))}w`
}
