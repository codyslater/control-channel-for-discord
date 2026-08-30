import { describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'
import { HostEvent, WebviewEvent } from '../shared/chatProtocol'
import { ChatMessage } from '../shared/types'
import { ChatDeps, ChatSession } from './chatSession'

const msg = (id: string, channelId: string): ChatMessage => ({
  id, channelId, authorName: 'bot', authorAvatarUrl: null, isApp: true,
  content: 'x', createdAt: Number(id), editedAt: null, attachments: [], webhookId: null,
})

function harness(loadHistory: ChatDeps['loadHistory'], extra: Partial<ChatDeps> = {}) {
  const posted: HostEvent[] = []
  let receive: ((ev: WebviewEvent) => void) | null = null
  const webview = {
    postMessage: async (ev: HostEvent) => { posted.push(ev); return true },
    onDidReceiveMessage: (cb: (ev: WebviewEvent) => void) => { receive = cb; return { dispose() {} } },
  } as unknown as vscode.Webview
  const deps: ChatDeps = {
    loadHistory, send: async () => {}, openRef: async () => {}, channelName: () => '',
    searchMembers: async () => [], ...extra,
  }
  const session = new ChatSession(webview, deps)
  const flush = () => new Promise((r) => setTimeout(r, 0))
  return { posted, session, inject: (ev: WebviewEvent) => receive!(ev), flush }
}

describe('ChatSession.setChannel', () => {
  it('posts reset with the history on success', async () => {
    const { posted, session } = harness(async (id) => [msg('1', id)])
    await session.setChannel('c1', 'general')
    expect(posted).toEqual([{ type: 'reset', channelId: 'c1', channelName: 'general', messages: [msg('1', 'c1')] }])
  })

  it('on history failure still resets to the new (empty) channel, then explains the failure', async () => {
    const { posted, session } = harness(async (id) => {
      if (id === 'locked') throw Object.assign(new Error('Missing Access'), { code: 50001 })
      return [msg('1', id)]
    })
    await session.setChannel('c1', 'general')
    await session.setChannel('locked', 'secret-thread')
    expect(posted.map((e) => e.type)).toEqual(['reset', 'reset', 'notice'])
    expect(posted[1]).toEqual({ type: 'reset', channelId: 'locked', channelName: 'secret-thread', messages: [] })
    expect(posted[2]).toMatchObject({ type: 'notice', text: expect.stringMatching(/can't see this channel or thread/i) })
    expect(session.channelId).toBe('locked')
  })
})

describe('ChatSession mentions', () => {
  it('answers memberQuery with members and the same seq', async () => {
    const items = [{ id: '2', name: 'Theo', kind: 'bot' as const }]
    const { posted, inject, flush } = harness(async () => [], { searchMembers: async (q) => (q === 'th' ? items : []) })
    inject({ type: 'memberQuery', query: 'th', seq: 7 })
    await flush()
    expect(posted).toEqual([{ type: 'members', seq: 7, items }])
  })
  it('a failing member search answers with an empty list, no notice', async () => {
    const { posted, inject, flush } = harness(async () => [], { searchMembers: async () => { throw new Error('offline') } })
    inject({ type: 'memberQuery', query: 'x', seq: 1 })
    await flush()
    expect(posted).toEqual([{ type: 'members', seq: 1, items: [] }])
  })
  it('passes mentions through to deps.send (empty when absent)', async () => {
    const calls: unknown[][] = []
    const { session, inject, flush } = harness(async () => [], { send: async (...a) => { calls.push(a) } })
    await session.setChannel('c1', 'general')
    inject({ type: 'send', text: 'hi <@2>', mentions: [{ id: '2', kind: 'bot' }] })
    inject({ type: 'send', text: 'plain' })
    await flush()
    expect(calls[0][0]).toBe('c1')
    expect(calls[0][1]).toBe('hi <@2>')
    expect(calls[0][3]).toEqual([{ id: '2', kind: 'bot' }])
    expect(calls[1][3]).toEqual([])
  })
})

describe('ChatSession.clear', () => {
  it('forgets the channel and posts clear so the webview goes blank', async () => {
    const { posted, session } = harness(async (id) => [msg('1', id)])
    await session.setChannel('c1', 'general')
    session.clear()
    expect(session.channelId).toBeNull()
    expect(posted.at(-1)).toEqual({ type: 'clear' })
  })
  it('after clear, live events for the old channel are not forwarded', async () => {
    const { posted, session } = harness(async (id) => [msg('1', id)])
    await session.setChannel('c1', 'general')
    session.clear()
    session.handleServiceEvent({ type: 'message', message: msg('2', 'c1') })
    expect(posted.filter((e) => e.type === 'append')).toEqual([])
  })
})
