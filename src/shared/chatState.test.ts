import { describe, expect, test } from 'vitest'
import { ChatMessage } from './types'
import { initialState, reduce } from './chatState'

const msg = (id: string, content = 'x'): ChatMessage => ({
  id, channelId: 'c1', authorName: 'bot', authorAvatarUrl: null, isApp: true,
  content, createdAt: Number(id), editedAt: null, attachments: [], webhookId: null,
})

describe('reduce', () => {
  const base = reduce(initialState, { type: 'reset', channelId: 'c1', channelName: 'general', messages: [msg('2'), msg('3')] })

  test('reset replaces everything', () => {
    expect(base.channelId).toBe('c1')
    expect(base.messages.map((m) => m.id)).toEqual(['2', '3'])
  })
  test('append adds and dedupes by id', () => {
    const s = reduce(reduce(base, { type: 'append', message: msg('4') }), { type: 'append', message: msg('4') })
    expect(s.messages.map((m) => m.id)).toEqual(['2', '3', '4'])
  })
  test('update replaces in place, ignores unknown ids', () => {
    const s = reduce(base, { type: 'update', message: msg('3', 'edited') })
    expect(s.messages[1].content).toBe('edited')
    expect(reduce(base, { type: 'update', message: msg('9') }).messages).toHaveLength(2)
  })
  test('delete removes', () => {
    expect(reduce(base, { type: 'delete', id: '2' }).messages.map((m) => m.id)).toEqual(['3'])
  })
  test('history prepends and dedupes', () => {
    const s = reduce(base, { type: 'history', messages: [msg('1'), msg('2')] })
    expect(s.messages.map((m) => m.id)).toEqual(['1', '2', '3'])
  })
  test('status passthrough', () => {
    expect(reduce(base, { type: 'status', text: 'reconnecting' }).status).toBe('reconnecting')
  })
  test('commands is a state no-op', () => {
    const result = reduce(base, { type: 'commands', commands: [{ name: 'loc', description: 'get lines of code' }] })
    expect(result).toBe(base)
  })
  test('notice sets a per-channel banner; reset clears it but leaves connection status alone', () => {
    const s = reduce(reduce(base, { type: 'status', text: 'reconnecting' }), { type: 'notice', text: 'no access' })
    expect(s.notice).toBe('no access')
    expect(s.status).toBe('reconnecting')
    const next = reduce(s, { type: 'reset', channelId: 'c2', channelName: 'other', messages: [] })
    expect(next.notice).toBe('')
    expect(next.status).toBe('reconnecting')
    expect(next.messages).toEqual([])
  })
  test('clear returns to the blank state but keeps the connection status', () => {
    const s = reduce(reduce(base, { type: 'status', text: 'connected' }), { type: 'notice', text: 'x' })
    expect(reduce(s, { type: 'clear' })).toEqual({ ...initialState, status: 'connected' })
  })
})
