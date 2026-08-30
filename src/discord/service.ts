import {
  ChannelType, Client, Events, GatewayIntentBits, Guild,
  type GuildBasedChannel, type GuildMember, type Message, type PartialMessage,
} from 'discord.js'
import * as vscode from 'vscode'
import { ChannelNode, ChatMessage, Mentionable } from '../shared/types'
import { rankMembers } from '../shared/mentions'
import { snowflakeTime } from '../shared/activity'
import { ConnStatus } from '../ui/statusBar'
import { normalizeMessage } from './normalize'

export type ServiceEvent =
  | { type: 'status'; status: ConnStatus }
  | { type: 'channels'; channels: ChannelNode[] }
  | { type: 'message'; message: ChatMessage }
  | { type: 'messageUpdate'; message: ChatMessage }
  | { type: 'messageDelete'; channelId: string; id: string }

export class DiscordService {
  private client: Client | null = null
  private guild: Guild | null = null
  private emitter = new vscode.EventEmitter<ServiceEvent>()
  readonly onEvent = this.emitter.event
  guildId = ''
  private voiceRefreshTimer: ReturnType<typeof setTimeout> | null = null

  async start(token: string, guildId: string): Promise<void> {
    await this.stop()
    this.emitter.fire({ type: 'status', status: 'connecting' })
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
      ],
    })
    this.client = client

    client.on(Events.MessageCreate, (m) => {
      if (m.guildId === this.guildId) this.emitter.fire({ type: 'message', message: normalizeMessage(m) })
    })
    client.on(Events.MessageUpdate, (_old, m: Message | PartialMessage) => {
      if (!m.partial && m.guildId === this.guildId)
        this.emitter.fire({ type: 'messageUpdate', message: normalizeMessage(m) })
    })
    client.on(Events.MessageDelete, (m) => {
      if (m.guildId === this.guildId) this.emitter.fire({ type: 'messageDelete', channelId: m.channelId, id: m.id })
    })
    const refreshChannels = () => this.emitter.fire({ type: 'channels', channels: this.channelsSnapshot() })
    for (const ev of [Events.ChannelCreate, Events.ChannelDelete, Events.ChannelUpdate,
                      Events.ThreadCreate, Events.ThreadDelete, Events.ThreadUpdate] as const) {
      client.on(ev as never, refreshChannels as never)
    }
    client.on(Events.VoiceStateUpdate, () => this.scheduleChannelRefresh())
    client.on(Events.ShardReconnecting, () => this.emitter.fire({ type: 'status', status: 'reconnecting' }))
    client.on(Events.ShardResume, () => this.emitter.fire({ type: 'status', status: 'connected' }))
    client.on(Events.ShardDisconnect, (ev) => {
      if (ev.code === 4014) this.emitter.fire({ type: 'status', status: 'intent-error' })
    })

    // Attach the ready waiter BEFORE login — ready can fire before login() resolves.
    const ready = new Promise<void>((resolve) => client.once(Events.ClientReady, () => resolve()))
    try {
      await client.login(token)
    } catch (e: unknown) {
      const code = (e as { code?: string }).code
      this.emitter.fire({ type: 'status', status: code === 'DisallowedIntents' ? 'intent-error' : 'auth-error' })
      throw e
    }
    await ready

    if (!guildId) {
      const guilds = [...client.guilds.cache.values()]
      if (guilds.length !== 1) throw new Error(`Bot is in ${guilds.length} guilds — set discordVscode.guildId`)
      guildId = guilds[0].id
    }
    this.guildId = guildId
    this.guild = await client.guilds.fetch(guildId)
    await this.guild.channels.fetch()
    await this.guild.channels.fetchActiveThreads()
    this.emitter.fire({ type: 'status', status: 'connected' })
    this.emitter.fire({ type: 'channels', channels: this.channelsSnapshot() })
  }

  async stop(): Promise<void> {
    await this.client?.destroy()
    this.client = null
    this.guild = null
    if (this.voiceRefreshTimer) {
      clearTimeout(this.voiceRefreshTimer)
      this.voiceRefreshTimer = null
    }
  }

  private scheduleChannelRefresh() {
    if (this.voiceRefreshTimer) return
    this.voiceRefreshTimer = setTimeout(() => {
      this.voiceRefreshTimer = null
      this.emitter.fire({ type: 'channels', channels: this.channelsSnapshot() })
    }, 300)
  }

  channelsSnapshot(): ChannelNode[] {
    if (!this.guild) return []
    const nodes: ChannelNode[] = []
    const textLikeIds = new Set<string>()
    for (const ch of this.guild.channels.cache.values()) {
      if (ch.type === ChannelType.GuildCategory) {
        nodes.push({ id: ch.id, name: ch.name, kind: 'category', parentId: null, position: ch.position })
      } else if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement) {
        nodes.push({
          id: ch.id, name: ch.name, kind: 'text', parentId: ch.parentId, position: ch.position,
          ...(ch.lastMessageId ? { lastAt: snowflakeTime(ch.lastMessageId) } : {}),
        })
        textLikeIds.add(ch.id)
      } else if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
        nodes.push({
          id: ch.id,
          name: ch.name,
          kind: 'voice',
          parentId: ch.parentId,
          position: ch.position,
          occupants: [...ch.members.values()].map((m) => m.displayName),
        })
      }
    }
    // Second pass: only emit threads whose parent is itself an emitted text/announcement
    // channel — hides forum/media threads (v1 scope) regardless of cache iteration order.
    for (const ch of this.guild.channels.cache.values()) {
      if (ch.isThread() && !ch.archived && ch.parentId && textLikeIds.has(ch.parentId))
        nodes.push({
          id: ch.id, name: ch.name, kind: 'thread', parentId: ch.parentId, position: 0,
          ...(ch.lastMessageId ? { lastAt: snowflakeTime(ch.lastMessageId) } : {}),
        })
    }
    return nodes
  }

  channelName(id: string): string {
    return this.guild?.channels.cache.get(id)?.name ?? id
  }

  isThread(channelId: string): boolean {
    return this.guild?.channels.cache.get(channelId)?.isThread() ?? false
  }

  /** Creates a public thread in a text/announcement channel. */
  async createThread(channelId: string, name: string): Promise<{ id: string; name: string }> {
    const ch = this.guild?.channels.cache.get(channelId)
    if (!ch || ch.isThread() || !('threads' in ch)) throw new Error('Threads can only be created in a text channel')
    const t = await (ch as unknown as { threads: { create(o: { name: string }): Promise<{ id: string; name: string }> } })
      .threads.create({ name })
    return { id: t.id, name: t.name }
  }

  /**
   * Resolves a single channel/thread by ID for deep-link jump targets, falling back to a
   * REST fetch when it's not in cache (e.g. an archived thread that predates this session's
   * `fetchActiveThreads()` at startup, or one that just isn't cached yet). Returns null if the
   * ID doesn't resolve to a supported channel kind (mirrors channelsSnapshot's kind filter).
   */
  async resolveChannel(id: string): Promise<ChannelNode | null> {
    if (!this.guild) return null
    const cached = this.guild.channels.cache.get(id)
    const ch = cached ?? (await this.guild.channels.fetch(id).catch(() => null))
    if (!ch) return null
    if (ch.type === ChannelType.GuildCategory) return { id: ch.id, name: ch.name, kind: 'category', parentId: null, position: ch.position }
    if (ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement)
      return { id: ch.id, name: ch.name, kind: 'text', parentId: ch.parentId, position: ch.position }
    if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)
      return {
        id: ch.id, name: ch.name, kind: 'voice', parentId: ch.parentId, position: ch.position,
        occupants: [...ch.members.values()].map((m) => m.displayName),
      }
    if (ch.isThread()) return { id: ch.id, name: ch.name, kind: 'thread', parentId: ch.parentId, position: 0 }
    return null
  }

  private textChannel(id: string) {
    const ch = this.guild?.channels.cache.get(id) as GuildBasedChannel | undefined
    if (!ch || !('messages' in ch)) throw new Error(`Not a readable channel: ${id}`)
    return ch
  }

  async loadHistory(channelId: string, before?: string): Promise<ChatMessage[]> {
    const ch = this.textChannel(channelId)
    const batch = await ch.messages.fetch({ limit: 50, ...(before ? { before } : {}) })
    return [...batch.values()].reverse().map(normalizeMessage)
  }

  async getPersona(userId: string): Promise<{ username: string; avatarURL?: string }> {
    if (!this.guild || !userId) return { username: 'vscode' }
    try {
      const member = await this.guild.members.fetch(userId)
      return { username: member.displayName, avatarURL: member.displayAvatarURL({ size: 128, extension: 'png' }) }
    } catch {
      return { username: 'vscode' }
    }
  }

  /** Members for the composer's `@` picker: cached members (instant) merged with a
   *  REST prefix search (`GET /guilds/{id}/members/search`, no privileged intent
   *  needed, includes bots). Ranked by `rankMembers`; [] when offline/failing. */
  async searchMembers(query: string, limit = 10): Promise<Mentionable[]> {
    const guild = this.guild
    if (!guild) return []
    const q = query.toLowerCase()
    const out = new Map<string, Mentionable>()
    const add = (m: GuildMember) =>
      out.set(m.id, { id: m.id, name: m.displayName, username: m.user.username, kind: m.user.bot ? 'bot' : 'user' })
    for (const m of guild.members.cache.values())
      if (!q || m.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q)) add(m)
    if (q) {
      try {
        for (const m of (await guild.members.search({ query, limit })).values()) add(m)
      } catch {
        // REST failure (offline, throttled): cache hits are still returned
      }
    }
    return rankMembers(query, [...out.values()]).slice(0, limit)
  }

  /** Returns the raw channel for the webhook sender (Task 11). */
  async getSendTarget(channelId: string): Promise<unknown> {
    return this.textChannel(channelId)
  }
}
