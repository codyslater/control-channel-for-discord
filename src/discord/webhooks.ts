export const HOOK_NAME = 'vscode-bridge'

/** Discord's SUPPRESS_NOTIFICATIONS ("@silent") message flag — the extension's
 *  sends never ping anyone; delivery and bot visibility are unaffected. */
export const SILENT = 1 << 12

/** Per-send delivery options. `allowedUserIds` are the only user mentions Discord
 *  will parse (render + notify + surface in `message.mentions`); bots MUST be
 *  listed too or they never see the mention. `silent` sets SUPPRESS_NOTIFICATIONS. */
export interface SendOptions {
  allowedUserIds: string[]
  silent: boolean
}
export const DEFAULT_SEND: SendOptions = { allowedUserIds: [], silent: true }

type AllowedMentions = { users: string[]; parse: [] }
function delivery(o: SendOptions): { flags?: number; allowedMentions: AllowedMentions } {
  return { ...(o.silent ? { flags: SILENT } : {}), allowedMentions: { users: o.allowedUserIds, parse: [] } }
}

export interface HookLike {
  id?: string
  name: string
  token: string | null
  send(o: {
    content: string; username: string; avatarURL?: string; threadId?: string
    flags?: number; allowedMentions?: AllowedMentions
  }): Promise<unknown>
}

export interface WebhookChannelLike {
  id: string
  fetchWebhooks(): Promise<{ values(): Iterable<HookLike> }>
  createWebhook(o: { name: string }): Promise<HookLike>
}

export interface SendTarget {
  /** Absent when no webhook-capable channel is available (e.g. a thread under a
   *  forum/media channel, or a thread whose parent is uncached/deleted) — in that
   *  case sending always goes through `fallback`. */
  channel?: WebhookChannelLike
  threadId?: string
  fallback(content: string, opts?: SendOptions): Promise<unknown>
}

export type SendResult = 'sent' | 'sent-as-bot' | 'sent-as-bot-unsupported'

function isPermissionError(e: unknown): boolean {
  return (e as { code?: number }).code === 50013
}

/** Discord's "Unknown Webhook" — the cached hook was deleted server-side. */
function isUnknownWebhook(e: unknown): boolean {
  return (e as { code?: number }).code === 10015
}

/** Duck-typed capability check: does this object support webhook fetch/create? */
function isWebhookCapable(x: unknown): x is WebhookChannelLike {
  const c = x as Partial<WebhookChannelLike> | null | undefined
  return !!c && typeof c.fetchWebhooks === 'function' && typeof c.createWebhook === 'function'
}

export class WebhookSender {
  private cache = new Map<string, HookLike>()
  private hookIds = new Set<string>()
  private lastUsername: string | null = null

  constructor(private persona: () => Promise<{ username: string; avatarURL?: string }>) {}

  /** Ids of every vscode-bridge hook this sender has resolved — survives clear()
   *  deliberately: a hook id stays "ours" even after a reconnect drops the cache. */
  knownHookIds(): ReadonlySet<string> {
    return this.hookIds
  }

  lastPersonaName(): string | null {
    return this.lastUsername
  }

  /** Drops all cached hooks (e.g. on reconnect, so a dead client generation's hooks
   *  can't be reused). */
  clear(): void {
    this.cache.clear()
  }

  private async resolveHook(channel: WebhookChannelLike): Promise<HookLike> {
    let hook = this.cache.get(channel.id)
    if (!hook) {
      const existing = await channel.fetchWebhooks()
      hook = [...existing.values()].find((h) => h.name === HOOK_NAME && h.token)
      if (!hook) hook = await channel.createWebhook({ name: HOOK_NAME })
      this.cache.set(channel.id, hook)
    }
    if (hook.id) this.hookIds.add(hook.id)
    return hook
  }

  private async resolveAndSend(
    channel: WebhookChannelLike, content: string, threadId: string | undefined, opts: SendOptions,
  ) {
    const hook = await this.resolveHook(channel)
    const p = await this.persona()
    this.lastUsername = p.username
    await hook.send({ content, username: p.username, avatarURL: p.avatarURL, threadId, ...delivery(opts) })
  }

  async send(target: SendTarget, content: string, opts: SendOptions = DEFAULT_SEND): Promise<SendResult> {
    if (!target.channel) {
      // Structural limitation (e.g. forum/media-channel thread), not a permissions
      // problem — no webhook-capable channel exists to try in the first place.
      await target.fallback(content, opts)
      return 'sent-as-bot-unsupported'
    }
    const channel = target.channel
    try {
      await this.resolveAndSend(channel, content, target.threadId, opts)
      return 'sent'
    } catch (e) {
      // Any failure means the cached hook (if any) may be stale — evict so the next
      // attempt re-resolves instead of retrying the same poisoned entry forever.
      this.cache.delete(channel.id)
      if (isUnknownWebhook(e)) {
        try {
          await this.resolveAndSend(channel, content, target.threadId, opts)
          return 'sent'
        } catch (retryErr) {
          this.cache.delete(channel.id)
          if (!isPermissionError(retryErr)) throw retryErr
          await target.fallback(content, opts)
          return 'sent-as-bot'
        }
      }
      if (!isPermissionError(e)) throw e
      await target.fallback(content, opts)
      return 'sent-as-bot'
    }
  }
}

/** Adapt a discord.js TextChannel | ThreadChannel (typed loosely to stay test-friendly). */
export function toSendTarget(raw: unknown): SendTarget {
  const ch = raw as {
    isThread?: () => boolean
    parent?: (Partial<WebhookChannelLike> & { id: string }) | null
    id: string
    send(o: { content: string; flags?: number; allowedMentions?: AllowedMentions }): Promise<unknown>
  } & Partial<WebhookChannelLike>
  const isThread = ch.isThread?.() ?? false
  const fallback = (c: string, o: SendOptions = DEFAULT_SEND) => ch.send({ content: c, ...delivery(o) })
  // For threads, only the parent can host webhooks; for plain channels, it's the
  // channel itself. Either may turn out not to be webhook-capable (forum/media
  // channel parent, or an uncached/deleted parent resolving to null/undefined).
  const candidate = isThread ? ch.parent : ch
  if (!isWebhookCapable(candidate)) return { fallback }
  return isThread ? { channel: candidate, threadId: ch.id, fallback } : { channel: candidate, fallback }
}
