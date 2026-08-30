import { describe, expect, test } from 'vitest'
import { MessageLike, normalizeMessage } from './normalize'

const base: MessageLike = {
  id: '111', channelId: 'c1', content: 'hello',
  createdTimestamp: 1000, editedTimestamp: null,
  author: { bot: true, username: 'agent', displayAvatarURL: () => 'https://cdn/x.png' },
  member: { displayName: 'Agent Smith' },
  webhookId: null,
  attachments: new Map([['a', { url: 'https://cdn/plot.png', name: 'plot.png', contentType: 'image/png' }]]),
}

describe('normalizeMessage', () => {
  test('prefers member displayName, maps attachments, flags bots as app', () => {
    expect(normalizeMessage(base)).toEqual({
      id: '111', channelId: 'c1', content: 'hello', createdAt: 1000, editedAt: null,
      authorName: 'Agent Smith', authorAvatarUrl: 'https://cdn/x.png', isApp: true,
      attachments: [{ url: 'https://cdn/plot.png', filename: 'plot.png', isImage: true }],
      webhookId: null,
      mentions: [],
    })
  })
  test('extracts user, bot and role mentions with display names', () => {
    const m = normalizeMessage({
      ...base,
      content: 'hi <@10> <@11> <@&20>',
      mentions: {
        users: new Map([
          ['10', { id: '10', bot: false, username: 'sam', globalName: 'Sam G' }],
          ['11', { id: '11', bot: true, username: 'agent', globalName: null }],
        ]),
        members: new Map([['10', { displayName: 'Sammy' }]]),
        roles: new Map([['20', { id: '20', name: 'devs' }]]),
      },
    })
    expect(m.mentions).toEqual([
      { id: '10', name: 'Sammy', kind: 'user' },
      { id: '11', name: 'agent', kind: 'bot' },
      { id: '20', name: 'devs', kind: 'role' },
    ])
  })
  test('falls back to username; webhook counts as app; non-image attachment', () => {
    const m = normalizeMessage({
      ...base, member: null, webhookId: 'w1',
      author: { bot: false, username: 'dev', displayAvatarURL: () => 'https://cdn/dev.png' },
      attachments: new Map([['b', { url: 'https://cdn/data.csv', name: 'data.csv', contentType: 'text/csv' }]]),
    })
    expect(m.authorName).toBe('dev')
    expect(m.isApp).toBe(true)
    expect(m.attachments[0].isImage).toBe(false)
  })
  test('passes webhookId through, null when absent', () => {
    expect(normalizeMessage({ ...base, webhookId: 'wh1' } as never).webhookId).toBe('wh1')
    expect(normalizeMessage(base as never).webhookId).toBeNull()
  })
})
