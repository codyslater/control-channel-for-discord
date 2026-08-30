import { describe, expect, it } from 'vitest'
import { isContinuation, needsDayDivider, sameDay } from './grouping'
import { ChatMessage } from './types'

const msg = (over: Partial<ChatMessage>): ChatMessage => ({
  id: '1', channelId: 'c', authorName: 'Me', authorAvatarUrl: null, isApp: true,
  content: 'x', createdAt: Date.UTC(2026, 6, 17, 12, 0, 0), editedAt: null, attachments: [], webhookId: null,
  ...over,
})

describe('isContinuation', () => {
  const base = msg({})
  it('is false with no previous message', () => {
    expect(isContinuation(undefined, base)).toBe(false)
  })
  it('groups same author within 5 minutes', () => {
    expect(isContinuation(base, msg({ id: '2', createdAt: base.createdAt + 4 * 60_000 }))).toBe(true)
  })
  it('does not group across authors', () => {
    expect(isContinuation(base, msg({ id: '2', authorName: 'agent', createdAt: base.createdAt + 1000 }))).toBe(false)
  })
  it('does not group across the app/human boundary', () => {
    expect(isContinuation(base, msg({ id: '2', isApp: false, createdAt: base.createdAt + 1000 }))).toBe(false)
  })
  it('does not group past the 5-minute window', () => {
    expect(isContinuation(base, msg({ id: '2', createdAt: base.createdAt + 5 * 60_000 }))).toBe(false)
  })
})

describe('needsDayDivider / sameDay', () => {
  it('no divider without a previous message', () => {
    expect(needsDayDivider(undefined, msg({}))).toBe(false)
  })
  it('divider when the local date changes', () => {
    const prev = msg({})
    const next = msg({ id: '2', createdAt: prev.createdAt + 24 * 60 * 60_000 })
    expect(needsDayDivider(prev, next)).toBe(true)
    expect(sameDay(prev.createdAt, next.createdAt)).toBe(false)
  })
  it('no divider within the same day', () => {
    const prev = msg({})
    expect(needsDayDivider(prev, msg({ id: '2', createdAt: prev.createdAt + 60_000 }))).toBe(false)
  })
})
