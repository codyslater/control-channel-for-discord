import { describe, expect, it } from 'vitest'
import { composeLocationMessage, parseSlashInput, SLASH_COMMANDS } from './slashCommands'
import { filterCommands } from './slashCommands'

describe('parseSlashInput', () => {
  it('intercepts a bare known command', () => {
    expect(parseSlashInput('/loc')).toEqual({ kind: 'command', command: 'loc', rest: '' })
  })
  it('intercepts a known command with trailing text', () => {
    expect(parseSlashInput('/loc check this out')).toEqual({ kind: 'command', command: 'loc', rest: 'check this out' })
  })
  it('is case-insensitive on the command name', () => {
    expect(parseSlashInput('/LoC hi')).toEqual({ kind: 'command', command: 'loc', rest: 'hi' })
  })
  it('treats // as an escape for a literal leading slash', () => {
    expect(parseSlashInput('//loc literal')).toEqual({ kind: 'text', text: '/loc literal' })
  })
  it('passes unknown commands through untouched', () => {
    expect(parseSlashInput('/frobnicate now')).toEqual({ kind: 'text', text: '/frobnicate now' })
  })
  it('does not match a longer word sharing the prefix', () => {
    expect(parseSlashInput('/location')).toEqual({ kind: 'text', text: '/location' })
  })
  it('ignores leading whitespace (no interception)', () => {
    expect(parseSlashInput(' /loc hi')).toEqual({ kind: 'text', text: ' /loc hi' })
  })
  it('trims trailing whitespace after a bare command', () => {
    expect(parseSlashInput('/loc   ')).toEqual({ kind: 'command', command: 'loc', rest: '' })
  })
  it('keeps newlines inside rest', () => {
    expect(parseSlashInput('/loc line1\nline2')).toEqual({ kind: 'command', command: 'loc', rest: 'line1\nline2' })
  })
  it('registry contains /loc', () => {
    expect(SLASH_COMMANDS.map((c) => c.name)).toContain('loc')
  })
})

describe('composeLocationMessage', () => {
  it('returns just the location for a bare command', () => {
    expect(composeLocationMessage('', '📍 host · repo')).toBe('📍 host · repo')
  })
  it('puts user text first, location on the next line', () => {
    expect(composeLocationMessage('check this', '📍 host · repo')).toBe('check this\n📍 host · repo')
  })
})

describe('filterCommands', () => {
  const cmds = [
    { name: 'loc', description: 'share location' },
    { name: 'log', description: 'something else' },
  ]
  it('is closed for non-slash input', () => {
    expect(filterCommands('hello', cmds)).toBeNull()
  })
  it('opens with all commands on a bare slash', () => {
    expect(filterCommands('/', cmds)).toEqual(cmds)
  })
  it('filters by prefix, case-insensitive', () => {
    expect(filterCommands('/LO', cmds)).toEqual(cmds)
    expect(filterCommands('/loc', cmds)).toEqual([cmds[0]])
  })
  it('is closed for the // escape', () => {
    expect(filterCommands('//', cmds)).toBeNull()
  })
  it('is closed once a space is typed', () => {
    expect(filterCommands('/loc ', cmds)).toBeNull()
  })
  it('is closed when nothing matches', () => {
    expect(filterCommands('/zzz', cmds)).toBeNull()
  })
})
