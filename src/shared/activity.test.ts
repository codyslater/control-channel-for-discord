import { describe, expect, it } from 'vitest'
import {
  ACTIVITY_CAP, ActivityContext, ActivityEntry, applyMessage, isOwnPost, markRead, previewOf, rankActivity,
  relativeTime, seedActivity, shouldTrack, snowflakeTime, unreadTotal,
} from './activity'
import { ChatMessage } from './types'

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: '1', channelId: 'c1', authorName: 'agent', authorAvatarUrl: null, isApp: false,
  content: 'x', createdAt: 1, editedAt: null, attachments: [], webhookId: null, ...over,
})
const ctx = (over: Partial<ActivityContext>): ActivityContext => ({
  silenced: new Set(), watched: new Set(), ownHookIds: new Set(), personaName: 'Me', ...over,
})

describe('isOwnPost', () => {
  it('true when webhookId matches a known own hook', () => {
    expect(isOwnPost(msg({ webhookId: 'wh1' }), ctx({ ownHookIds: new Set(['wh1']) }))).toBe(true)
  })
  it('true for app messages matching the persona name (other-machine posts)', () => {
    expect(isOwnPost(msg({ isApp: true, authorName: 'Me' }), ctx({}))).toBe(true)
  })
  it('false for a bot with the persona name but empty persona', () => {
    expect(isOwnPost(msg({ isApp: true, authorName: '' }), ctx({ personaName: '' }))).toBe(false)
  })
  it('false for ordinary bot/human messages', () => {
    expect(isOwnPost(msg({}), ctx({}))).toBe(false)
  })
})

describe('shouldTrack', () => {
  it('tracks a normal message', () => {
    expect(shouldTrack(msg({}), ctx({}))).toBe(true)
  })
  it('skips silenced channels', () => {
    expect(shouldTrack(msg({}), ctx({ silenced: new Set(['c1']) }))).toBe(false)
  })
  it('skips watched channels (open in sidebar/pop-out/dock)', () => {
    expect(shouldTrack(msg({}), ctx({ watched: new Set(['c1']) }))).toBe(false)
  })
  it('skips own posts', () => {
    expect(shouldTrack(msg({ webhookId: 'wh1' }), ctx({ ownHookIds: new Set(['wh1']) }))).toBe(false)
  })
})

describe('previewOf', () => {
  it('resolves mentions, flattens whitespace and code, truncates to 60 chars', () => {
    const m = msg({ content: 'hey <@7> look:\n```py\nprint(1)\n```\n**bold** ' + 'x'.repeat(80), mentions: [{ id: '7', name: 'Theo', kind: 'bot' }] })
    const p = previewOf(m)
    expect(p.startsWith('hey @Theo look: print(1) bold x')).toBe(true)
    expect(p.length).toBeLessThanOrEqual(61) // 60 + ellipsis
    expect(p.endsWith('…')).toBe(true)
  })
  it('describes attachment-only messages', () => {
    expect(previewOf(msg({ content: '', attachments: [{ url: 'u', filename: 'plot.png', isImage: true }] }))).toBe('[image] plot.png')
    expect(previewOf(msg({ content: '', attachments: [{ url: 'u', filename: 'data.csv', isImage: false }] }))).toBe('📎 data.csv')
  })
})

describe('applyMessage / markRead', () => {
  it('tracked message bumps unread and sets mention; untracked only updates recency/preview', () => {
    let list = applyMessage([], msg({ channelId: 'c1', createdAt: 10, authorName: 'bot', content: 'a' }), { track: true, mentionsMe: false })
    expect(list[0]).toMatchObject({ channelId: 'c1', lastAt: 10, lastAuthor: 'bot', lastPreview: 'a', unread: 1, mentioned: false, unreadSince: false })
    list = applyMessage(list, msg({ channelId: 'c1', createdAt: 11, content: 'b' }), { track: true, mentionsMe: true })
    expect(list[0]).toMatchObject({ unread: 2, mentioned: true, lastPreview: 'b' })
    list = applyMessage(list, msg({ channelId: 'c1', createdAt: 12, authorName: 'me', content: 'c' }), { track: false, mentionsMe: false })
    expect(list[0]).toMatchObject({ unread: 2, mentioned: true, lastAuthor: 'me', lastPreview: 'c', lastAt: 12 })
  })
  it('markRead zeroes unread/mentioned/unreadSince but keeps the entry', () => {
    const list = applyMessage([], msg({ channelId: 'c1', createdAt: 10 }), { track: true, mentionsMe: true })
    const read = markRead(list, 'c1')
    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ unread: 0, mentioned: false, unreadSince: false, lastPreview: 'x' })
    expect(markRead(list, 'nope')).toEqual(list)
  })
})

describe('seedActivity', () => {
  it('adds never-seen channels as read; marks unreadSince only when newer than a known last-read', () => {
    const list = seedActivity([], [{ channelId: 'a', lastAt: 100 }, { channelId: 'b', lastAt: 100 }, { channelId: 'c', lastAt: 50 }], { b: 90, c: 60 })
    const byId = Object.fromEntries(list.map((e) => [e.channelId, e]))
    expect(byId.a).toMatchObject({ lastAt: 100, unread: 0, unreadSince: false })
    expect(byId.b).toMatchObject({ lastAt: 100, unreadSince: true })
    expect(byId.c).toMatchObject({ lastAt: 50, unreadSince: false })
  })
  it('reconciles with an existing feed: newer seed bumps lastAt and drops the stale preview; older seed keeps everything', () => {
    const existing = applyMessage([], msg({ channelId: 'a', createdAt: 100, content: 'kept' }), { track: true, mentionsMe: false })
    const out = seedActivity(existing, [{ channelId: 'a', lastAt: 100 }], {})
    expect(out[0]).toMatchObject({ lastAt: 100, lastPreview: 'kept', unread: 1 })
    const newer = seedActivity(existing, [{ channelId: 'a', lastAt: 200 }], { a: 150 })
    expect(newer[0]).toMatchObject({ lastAt: 200, unreadSince: true })
    expect(newer[0].lastPreview).toBeUndefined()
  })
})

describe('rankActivity / unreadTotal', () => {
  it('mentioned first, then unread, then the rest — newest first within each tier; capped', () => {
    const e = (id: string, lastAt: number, over: Partial<ActivityEntry> = {}): ActivityEntry => ({ channelId: id, lastAt, unread: 0, mentioned: false, unreadSince: false, ...over })
    const list = [e('old-mention', 1, { mentioned: true, unread: 1 }), e('new', 9), e('mid', 5), e('old-unread', 2, { unread: 3 }), e('older-since', 1, { unreadSince: true })]
    expect(rankActivity(list).map((x) => x.channelId)).toEqual(['old-mention', 'old-unread', 'older-since', 'new', 'mid'])
    const many = Array.from({ length: 40 }, (_, i) => e(String(i), i))
    expect(rankActivity(many)).toHaveLength(ACTIVITY_CAP)
    expect(rankActivity(many)[0].channelId).toBe('39')
  })
  it('a time window hides read entries older than it but keeps unread/mentioned ones; 0 = no window', () => {
    const now = 1_000_000
    const e = (id: string, ageMin: number, over: Partial<ActivityEntry> = {}): ActivityEntry =>
      ({ channelId: id, lastAt: now - ageMin * 60_000, unread: 0, mentioned: false, unreadSince: false, ...over })
    const list = [e('fresh', 5), e('stale', 40), e('stale-unread', 40, { unread: 2 }), e('stale-mention', 60, { mentioned: true, unread: 1 }), e('stale-since', 90, { unreadSince: true })]
    expect(rankActivity(list, { now, windowMs: 15 * 60_000 }).map((x) => x.channelId)).toEqual(['stale-mention', 'stale-unread', 'stale-since', 'fresh'])
    expect(rankActivity(list, { now, windowMs: 0 })).toHaveLength(5)
  })
  it('unreadTotal counts unread messages and unreadSince as 1', () => {
    const list = [
      { channelId: 'a', lastAt: 1, unread: 3, mentioned: false, unreadSince: false },
      { channelId: 'b', lastAt: 1, unread: 0, mentioned: false, unreadSince: true },
    ]
    expect(unreadTotal(list)).toBe(4)
  })
})

describe('relativeTime / snowflakeTime', () => {
  it('formats compact relative times', () => {
    const now = 1_000_000_000
    expect(relativeTime(now, now - 20_000)).toBe('now')
    expect(relativeTime(now, now - 3 * 60_000)).toBe('3m')
    expect(relativeTime(now, now - 2 * 3_600_000)).toBe('2h')
    expect(relativeTime(now, now - 5 * 86_400_000)).toBe('5d')
    expect(relativeTime(now, now - 21 * 86_400_000)).toBe('3w')
  })
  it('decodes a Discord snowflake to its creation time', () => {
    expect(snowflakeTime('175928847299117063')).toBe(1462015105796) // Discord docs example
  })
})
