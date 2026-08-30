import { ChatMessage, Mentionable, MentionSend } from './types'
import { Ref } from './refs'

export type HostEvent =
  | { type: 'reset'; channelId: string; channelName: string; messages: ChatMessage[] }
  | { type: 'append'; message: ChatMessage }
  | { type: 'update'; message: ChatMessage }
  | { type: 'delete'; id: string }
  | { type: 'history'; messages: ChatMessage[] }
  | { type: 'status'; text: string }
  /** Per-channel problem (e.g. history unreadable); cleared by the next `reset`. */
  | { type: 'notice'; text: string }
  /** Answer to a memberQuery; `seq` echoes the request so stale answers can be dropped. */
  | { type: 'members'; seq: number; items: Mentionable[] }
  /** Back to the blank "Select a channel" state (e.g. the chat moved to a dock). */
  | { type: 'clear' }
  | { type: 'commands'; commands: { name: string; description: string }[] }

export type WebviewEvent =
  | { type: 'ready' }
  | { type: 'send'; text: string; mentions?: MentionSend[] }
  | { type: 'memberQuery'; query: string; seq: number }
  | { type: 'openRef'; ref: Ref }
  | { type: 'openExternal'; url: string }
  | { type: 'loadOlder'; beforeId: string }
  | { type: 'dropChannel'; id: string; name: string }
