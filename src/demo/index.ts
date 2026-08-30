/**
 * Demo backend — a fictional server with invented people, bots, and a scripted
 * storyboard of live messages. Used for screenshots/videos and for exercising
 * the UI without a Discord token. Loaded only when DISCORD_VSCODE_DEMO=1 (see
 * extension.ts); built to dist/demo.js, which .vscodeignore keeps out of the VSIX.
 *
 * No vscode import: the event API is a tiny structural stand-in so this file is
 * unit-testable and stays independent of the extension host.
 */
import type { ServiceEvent } from '../discord/service'
import { ChannelNode, ChatMessage, Mentionable, MentionRef } from '../shared/types'

type Listener = (e: ServiceEvent) => void
interface Disposable { dispose(): void }

/** Deterministic initial-letter avatar as a data URI (CSP allows data: images). */
function avatar(initial: string, bg: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="32" fill="${bg}"/><text x="32" y="41" font-family="sans-serif" font-size="28" font-weight="600" fill="#fff" text-anchor="middle">${initial}</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

/** A small "chart" image attachment, also inline as a data URI. */
const CHART_PNG_URL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="200" viewBox="0 0 420 200"><rect width="420" height="200" fill="#1e1e1e"/><polyline fill="none" stroke="#4fc1ff" stroke-width="3" points="20,170 80,150 140,158 200,110 260,95 320,60 400,30"/><polyline fill="none" stroke="#89d185" stroke-width="3" points="20,180 80,172 140,165 200,150 260,140 320,120 400,105"/><text x="20" y="30" fill="#ccc" font-family="sans-serif" font-size="14">val loss · v3 vs v2</text></svg>`,
  )

interface Person { id: string; name: string; username: string; bot: boolean; avatarUrl: string }

export const DEMO_USER_ID = '100'

const PEOPLE: Person[] = [
  { id: '100', name: 'Sam', username: 'sam', bot: false, avatarUrl: avatar('S', '#5865f2') },
  { id: '101', name: 'Priya', username: 'priya', bot: false, avatarUrl: avatar('P', '#e67e22') },
  { id: '200', name: 'Atlas', username: 'atlas-agent', bot: true, avatarUrl: avatar('A', '#2ecc71') },
  { id: '201', name: 'Nova', username: 'nova-agent', bot: true, avatarUrl: avatar('N', '#9b59b6') },
  { id: '202', name: 'Relay', username: 'relay', bot: true, avatarUrl: avatar('R', '#e74c3c') },
]
const P = Object.fromEntries(PEOPLE.map((p) => [p.name, p])) as Record<string, Person>

const CHANNELS: ChannelNode[] = [
  { id: '1', name: 'Control', kind: 'category', parentId: null, position: 0 },
  { id: '2', name: 'Projects', kind: 'category', parentId: null, position: 1 },
  { id: '10', name: 'general', kind: 'text', parentId: '1', position: 0 },
  { id: '11', name: 'agents', kind: 'text', parentId: '1', position: 1 },
  { id: '12', name: 'builds', kind: 'text', parentId: '1', position: 2 },
  { id: '13', name: 'standup', kind: 'voice', parentId: '1', position: 3, occupants: ['Priya'] },
  { id: '20', name: 'research', kind: 'text', parentId: '2', position: 0 },
  { id: '21', name: 'data-pipeline', kind: 'text', parentId: '2', position: 1 },
  { id: '30', name: 'retrain v3', kind: 'thread', parentId: '20', position: 0 },
  { id: '31', name: 'nightly 2026-08-30', kind: 'thread', parentId: '12', position: 0 },
]

const MIN = 60_000

/** Message factory: `<@id>` tokens in content are resolved to mention refs automatically. */
function make(
  id: string, channelId: string, who: Person, content: string, at: number,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  const mentions: MentionRef[] = []
  for (const m of content.matchAll(/<@(\d+)>/g)) {
    const p = PEOPLE.find((x) => x.id === m[1])
    if (p) mentions.push({ id: p.id, name: p.name, kind: p.bot ? 'bot' : 'user' })
  }
  return {
    id, channelId, authorName: who.name, authorAvatarUrl: who.avatarUrl, isApp: who.bot, content,
    createdAt: at, editedAt: null, attachments: [], webhookId: null, mentions, ...extra,
  }
}

function seedHistory(now: number): ChatMessage[] {
  const t = (minAgo: number) => now - minAgo * MIN
  return [
    make('h1', '10', P.Priya, 'Morning! Kicking off the v3 retrain in a bit — will post the curves in #research.', t(190)),
    make('h2', '10', P.Atlas, 'Standup notes are in `docs/notes/2026-08-30.md`. Two open items carried over.', t(185)),
    make('h3', '10', P.Sam, 'Thanks. I\'m in the extension repo today — `src/extension.ts:120` is where the send path starts if anyone needs it.', t(120), { isApp: true, webhookId: 'demo-hook' }),
    make('h4', '11', P.Atlas, 'Reloaded the agent registry. **3 agents online**: Atlas, Nova, Relay.', t(240)),
    make('h5', '11', P.Nova, 'Picking up the jump-link task. Will report in `src/deeplink/handler.ts`.', t(200)),
    make('h6', '12', P.Relay, '```\nnpm test\n Test Files  20 passed (20)\n      Tests  241 passed (241)\n```\nBuild **green** on `main`.', t(75)),
    make('h7', '12', P.Atlas, 'Nightly job scheduled for 02:00 UTC → thread 🧵 nightly 2026-08-30.', t(70)),
    make('h8', '20', P.Priya, 'v3 retrain finished. Val loss looks healthy — compare with `src/shared/grouping.ts:12-34` for the bucketing change.', t(50), {
      attachments: [{ url: CHART_PNG_URL, filename: 'val-loss-v3.svg', isImage: true }],
    }),
    make('h9', '20', P.Nova, 'Nice. <@100> can you eyeball the divider logic in `src/shared/grouping.ts:12-34` before we ship? One edge case around midnight.', t(12)),
    make('h10', '30', P.Nova, 'Thread for the retrain follow-ups. First: the learning-rate warmup was 500 steps, not 1000.', t(48)),
    make('h11', '30', P.Priya, 'Fixing in `src/refs/resolve.ts:88`, re-running.', t(9)),
    make('h12', '21', P.Relay, 'Pipeline failed on the last batch:\n```\nTraceback (most recent call last):\n  File "src/refs/resolve.ts", line 88, in resolveRef\n    ValueError: unknown ref shape\n```', t(6)),
    make('h13', '31', P.Atlas, 'Nightly 2026-08-30 started. 4 suites queued.', t(3)),
  ]
}

/** Live events after connect: [delay from start, channel, author, content]. */
const STORYBOARD: [number, string, string, string][] = [
  [4_000, '12', 'Relay', 'Build **#418** finished — 0 failures, 2 warnings. Details in `src/discord/webhooks.ts:60`.'],
  [10_000, '30', 'Nova', '<@100> warmup fix is in. Loss curve now matches v2 through step 2k — want me to open a PR?'],
  [17_000, '10', 'Priya', 'Heads up: I\'m moving the standup to 10:15 tomorrow.'],
  [26_000, '21', 'Relay', 'Retry succeeded after the ref fix. Pipeline back to green.'],
  [38_000, '11', 'Atlas', 'Idle. Ping me with `@Atlas` and a task when you want the next thing picked up.'],
]

const REPLIES = [
  'On it — running `npm test` now.',
  'Ack. I\'ll post the diff in this thread when it\'s ready.',
  'Got it. Two candidate approaches; going with the smaller one first.',
  'Done — see `src/shared/mentions.ts:41-59` for the change.',
]

class Emitter {
  private listeners = new Set<Listener>()
  event = (listener: Listener): Disposable => {
    this.listeners.add(listener)
    return { dispose: () => this.listeners.delete(listener) }
  }
  fire(e: ServiceEvent) {
    for (const l of [...this.listeners]) l(e)
  }
}

export class FakeDiscordService {
  private emitter = new Emitter()
  readonly onEvent = this.emitter.event
  guildId = 'demo'
  private channels: ChannelNode[] = CHANNELS.map((c) => ({ ...c }))
  private messages: ChatMessage[] = []
  private timers: ReturnType<typeof setTimeout>[] = []
  private seq = 1000
  private started = false

  constructor(private now: () => number = Date.now) {}

  private channelsWithRecency(): ChannelNode[] {
    return this.channels.map((c) => {
      if (c.kind !== 'text' && c.kind !== 'thread') return c
      const last = this.messages.filter((m) => m.channelId === c.id).map((m) => m.createdAt)
      return last.length ? { ...c, lastAt: Math.max(...last) } : c
    })
  }

  private emitChannels() {
    this.emitter.fire({ type: 'channels', channels: this.channelsSnapshot() })
  }

  private post(channelId: string, who: Person, content: string, extra: Partial<ChatMessage> = {}) {
    const m = make(`m${this.seq++}`, channelId, who, content, this.now(), extra)
    this.messages.push(m)
    this.emitter.fire({ type: 'message', message: m })
    this.emitChannels()
    return m
  }

  private schedule(ms: number, fn: () => void) {
    const t = setTimeout(fn, ms)
    this.timers.push(t)
  }

  async start(_token: string, _guildId: string): Promise<void> {
    await this.stop()
    this.started = true
    this.messages = seedHistory(this.now())
    this.emitter.fire({ type: 'status', status: 'connecting' })
    this.schedule(300, () => {
      this.emitter.fire({ type: 'status', status: 'connected' })
      this.emitChannels()
      for (const [delay, ch, who, content] of STORYBOARD) this.schedule(delay, () => this.post(ch, P[who], content))
    })
  }

  async stop(): Promise<void> {
    for (const t of this.timers) clearTimeout(t)
    this.timers = []
    if (this.started) this.emitter.fire({ type: 'status', status: 'off' })
    this.started = false
  }

  channelsSnapshot(): ChannelNode[] {
    return this.channelsWithRecency()
  }

  channelName(id: string): string {
    return this.channels.find((c) => c.id === id)?.name ?? id
  }

  isThread(channelId: string): boolean {
    return this.channels.find((c) => c.id === channelId)?.kind === 'thread'
  }

  async createThread(channelId: string, name: string): Promise<{ id: string; name: string }> {
    const parent = this.channels.find((c) => c.id === channelId)
    if (!parent || parent.kind !== 'text') throw new Error('Threads can only be created in a text channel')
    const id = String(this.seq++)
    this.channels.push({ id, name, kind: 'thread', parentId: channelId, position: 0 })
    this.emitChannels()
    return { id, name }
  }

  async resolveChannel(id: string): Promise<ChannelNode | null> {
    return this.channels.find((c) => c.id === id) ?? null
  }

  async loadHistory(channelId: string, before?: string): Promise<ChatMessage[]> {
    if (before) return [] // single page in the demo
    return this.messages.filter((m) => m.channelId === channelId).sort((a, b) => a.createdAt - b.createdAt)
  }

  async getPersona(_userId: string): Promise<{ username: string; avatarURL?: string }> {
    return { username: P.Sam.name, avatarURL: P.Sam.avatarUrl }
  }

  async searchMembers(query: string, limit = 10): Promise<Mentionable[]> {
    const q = query.toLowerCase()
    return PEOPLE.filter((p) => !q || p.name.toLowerCase().includes(q) || p.username.includes(q))
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, username: p.username, kind: p.bot ? 'bot' : 'user' }))
  }

  /** Not webhook-capable on purpose: the sender takes its bot-fallback path, which
   *  lands here and echoes the message back as Sam. A bot then replies. */
  async getSendTarget(channelId: string): Promise<unknown> {
    return {
      id: channelId,
      isThread: () => this.isThread(channelId),
      send: async (o: { content: string }) => {
        this.post(channelId, P.Sam, o.content, { isApp: true, webhookId: 'demo-hook' })
        const mentioned = PEOPLE.filter((p) => p.bot && o.content.includes(`<@${p.id}>`))
        const who = mentioned[0] ?? (channelId === '11' ? P.Atlas : P.Nova)
        const reply = REPLIES[this.seq % REPLIES.length]
        this.schedule(2_000, () => this.post(channelId, who, reply))
        return {}
      },
    }
  }
}

export function createDemoService(): FakeDiscordService {
  return new FakeDiscordService()
}
