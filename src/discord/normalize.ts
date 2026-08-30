import { ChatMessage, MentionRef } from '../shared/types'

export interface MessageLike {
  id: string
  channelId: string
  content: string
  createdTimestamp: number
  editedTimestamp: number | null
  author: { bot: boolean; username: string; displayAvatarURL(): string }
  member?: { displayName: string } | null
  webhookId?: string | null
  attachments: Map<string, { url: string; name: string; contentType: string | null }>
  /** discord.js MessageMentions, typed structurally (Collection extends Map). */
  mentions?: {
    users: Map<string, { id: string; bot: boolean; username: string; globalName?: string | null }>
    members?: Map<string, { displayName: string }> | null
    roles: Map<string, { id: string; name: string }>
  }
}

function mentionRefs(m: MessageLike): MentionRef[] {
  const users = [...(m.mentions?.users.values() ?? [])].map((u): MentionRef => ({
    id: u.id,
    name: m.mentions?.members?.get(u.id)?.displayName ?? u.globalName ?? u.username,
    kind: u.bot ? 'bot' : 'user',
  }))
  const roles = [...(m.mentions?.roles.values() ?? [])].map((r): MentionRef => ({ id: r.id, name: r.name, kind: 'role' }))
  return [...users, ...roles]
}

export function normalizeMessage(m: MessageLike): ChatMessage {
  return {
    id: m.id,
    channelId: m.channelId,
    content: m.content,
    createdAt: m.createdTimestamp,
    editedAt: m.editedTimestamp,
    authorName: m.member?.displayName ?? m.author.username,
    authorAvatarUrl: m.author.displayAvatarURL(),
    isApp: m.author.bot || !!m.webhookId,
    attachments: [...m.attachments.values()].map((a) => ({
      url: a.url,
      filename: a.name,
      isImage: a.contentType?.startsWith('image/') ?? false,
    })),
    webhookId: (m as { webhookId?: string | null }).webhookId ?? null,
    mentions: mentionRefs(m),
  }
}
