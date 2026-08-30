import { describe, expect, it } from 'vitest'
import { Mentionable, MentionRef } from './types'
import { isSilentSend, mentionQueryAtCaret, rankMembers, serializeMentions, splitMentions } from './mentions'

const m = (id: string, name: string, kind: 'user' | 'bot' = 'user', username?: string): Mentionable =>
  ({ id, name, kind, ...(username ? { username } : {}) })

describe('mentionQueryAtCaret', () => {
  it('finds an @word ending at the caret, anywhere in the text', () => {
    expect(mentionQueryAtCaret('@th', 3)).toEqual({ start: 0, query: 'th' })
    expect(mentionQueryAtCaret('hey @Th', 7)).toEqual({ start: 4, query: 'Th' })
    expect(mentionQueryAtCaret('hey @ there', 5)).toEqual({ start: 4, query: '' })
  })
  it('only looks at text before the caret', () => {
    expect(mentionQueryAtCaret('@theo hi', 3)).toEqual({ start: 0, query: 'th' })
  })
  it('returns null when not in an @word', () => {
    expect(mentionQueryAtCaret('hello', 5)).toBeNull()
    expect(mentionQueryAtCaret('a@b', 3)).toBeNull() // email-like, no boundary before @
    expect(mentionQueryAtCaret('@theo hi', 8)).toBeNull()
    expect(mentionQueryAtCaret('/loc', 4)).toBeNull()
  })
})

describe('rankMembers', () => {
  // Theo: name prefix; Sam: username prefix; Bethany + other: name substring ('th'); zed: no match
  const items = [m('1', 'zed'), m('2', 'Theo', 'bot'), m('3', 'Sam', 'user', 'thaddeus'), m('4', 'other', 'user', 'xx'), m('5', 'Bethany')]
  it('ranks name prefix, then username prefix, then substrings; drops non-matches; alphabetical within rank', () => {
    expect(rankMembers('th', items).map((x) => x.id)).toEqual(['2', '3', '5', '4'])
  })
  it('is case-insensitive', () => {
    expect(rankMembers('TH', items).map((x) => x.id)).toEqual(['2', '3', '5', '4'])
  })
  it('empty query returns everything alphabetically', () => {
    expect(rankMembers('', items).map((x) => x.name)).toEqual(['Bethany', 'other', 'Sam', 'Theo', 'zed'])
  })
})

describe('serializeMentions', () => {
  const picked = new Map<string, Mentionable>([
    ['Theo', m('2', 'Theo', 'bot')],
    ['Agent Smith', m('9', 'Agent Smith')],
  ])
  it('rewrites picked names to <@id> and lists them', () => {
    expect(serializeMentions('hey @Theo look', picked)).toEqual({ content: 'hey <@2> look', mentions: [{ id: '2', kind: 'bot' }] })
  })
  it('handles names with spaces, longest first, and dedupes ids', () => {
    expect(serializeMentions('@Agent Smith and @Theo and @Theo', picked)).toEqual({
      content: '<@9> and <@2> and <@2>',
      mentions: [{ id: '9', kind: 'user' }, { id: '2', kind: 'bot' }],
    })
  })
  it('leaves unpicked @words and partial matches alone', () => {
    expect(serializeMentions('@Theodore @nobody a@Theo', picked)).toEqual({ content: '@Theodore @nobody a@Theo', mentions: [] })
  })
  it('works at line starts in multi-line text', () => {
    expect(serializeMentions('line1\n@Theo line2', picked).content).toBe('line1\n<@2> line2')
  })
})

describe('splitMentions', () => {
  const refs: MentionRef[] = [{ id: '2', name: 'Theo', kind: 'bot' }, { id: '7', name: 'devs', kind: 'role' }]
  it('splits text around <@id>, <@!id>, <@&id> tokens, resolving names', () => {
    expect(splitMentions('hi <@2> and <@!2>, cc <@&7>!', refs)).toEqual([
      'hi ', refs[0], ' and ', refs[0], ', cc ', refs[1], '!',
    ])
  })
  it('renders unknown ids as @unknown and passes plain text through', () => {
    expect(splitMentions('<@404> x', refs)).toEqual([{ id: '404', name: 'unknown', kind: 'user' }, ' x'])
    expect(splitMentions('plain', refs)).toEqual(['plain'])
  })
})

describe('isSilentSend', () => {
  it('is silent with no mentions or bot-only mentions, loud when a human is mentioned', () => {
    expect(isSilentSend([])).toBe(true)
    expect(isSilentSend([{ kind: 'bot' }])).toBe(true)
    expect(isSilentSend([{ kind: 'bot' }, { kind: 'user' }])).toBe(false)
  })
})
