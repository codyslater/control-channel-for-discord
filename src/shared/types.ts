export interface ChatMessage {
  id: string
  channelId: string
  authorName: string
  authorAvatarUrl: string | null
  isApp: boolean
  content: string
  createdAt: number
  editedAt: number | null
  attachments: { url: string; filename: string; isImage: boolean }[]
  /** Discord webhook id when the message was posted via webhook; null otherwise. */
  webhookId: string | null
  /** Users/bots/roles referenced by <@id> / <@&id> tokens in `content`; absent on older shapes. */
  mentions?: MentionRef[]
}

export type MentionKind = 'user' | 'bot'

/** A member offered by the composer picker. `username` is the account name
 *  (for ranking); `name` is what's shown and what gets typed. */
export interface Mentionable {
  id: string
  name: string
  username?: string
  kind: MentionKind
}

/** A mention found in an incoming message, with its resolved display name. */
export interface MentionRef {
  id: string
  name: string
  kind: MentionKind | 'role'
}

/** What the webview reports for a send: which picked ids are in the content. */
export interface MentionSend {
  id: string
  kind: MentionKind
}

export interface ChannelNode {
  id: string
  name: string
  kind: 'category' | 'text' | 'thread' | 'voice'
  parentId: string | null
  position: number
  /** Display names of members currently connected — voice channels only. */
  occupants?: string[]
  /** True on synthetic copies rendered inside the 📌 Pinned tree section. */
  pinned?: boolean
  /** Creation time of the channel's last message (from Discord's lastMessageId) — text/thread only. */
  lastAt?: number
}
