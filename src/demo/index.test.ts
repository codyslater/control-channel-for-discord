import { describe, expect, it, vi } from 'vitest'
import type { ServiceEvent } from '../discord/service'
import { DEMO_USER_ID, FakeDiscordService } from './index'

describe('demo backend', () => {
  it('connects, seeds channels with recency, and runs the storyboard on fake timers', async () => {
    vi.useFakeTimers()
    const svc = new FakeDiscordService(() => Date.now())
    const events: ServiceEvent[] = []
    svc.onEvent((e) => events.push(e))
    await svc.start('demo', 'demo')
    await vi.advanceTimersByTimeAsync(400)
    expect(events.map((e) => e.type)).toEqual(['status', 'status', 'channels'])
    const channels = svc.channelsSnapshot()
    expect(channels.some((c) => c.kind === 'thread')).toBe(true)
    expect(channels.filter((c) => c.kind === 'text').every((c) => typeof c.lastAt === 'number')).toBe(true)
    await vi.advanceTimersByTimeAsync(11_000)
    const live = events.filter((e): e is Extract<ServiceEvent, { type: 'message' }> => e.type === 'message')
    expect(live.length).toBe(2)
    expect(live[1].message.mentions?.some((m) => m.id === DEMO_USER_ID)).toBe(true)
    await svc.stop()
    vi.useRealTimers()
  })

  it('serves history per channel, searches members, and echoes sends with a bot reply', async () => {
    vi.useFakeTimers()
    const svc = new FakeDiscordService()
    const events: ServiceEvent[] = []
    svc.onEvent((e) => events.push(e))
    await svc.start('demo', 'demo')
    await vi.advanceTimersByTimeAsync(400)
    const research = await svc.loadHistory('20')
    expect(research.length).toBeGreaterThan(0)
    expect(research.every((m) => m.channelId === '20')).toBe(true)
    expect(await svc.loadHistory('20', research[0].id)).toEqual([])
    expect((await svc.searchMembers('at')).map((m) => m.name)).toEqual(['Atlas'])
    const target = (await svc.getSendTarget('11')) as { send(o: { content: string }): Promise<unknown> }
    await target.send({ content: 'hey <@200> run the suite' })
    await vi.advanceTimersByTimeAsync(2_500)
    const msgs = events.filter((e): e is Extract<ServiceEvent, { type: 'message' }> => e.type === 'message').map((e) => e.message)
    expect(msgs.at(-2)?.authorName).toBe('Sam')
    expect(msgs.at(-1)?.authorName).toBe('Atlas')
    await svc.stop()
    vi.useRealTimers()
  })
})
