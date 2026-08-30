import { describe, expect, test } from 'vitest'
import { AUTHORITY, buildOpenUri, buildRedirectUrl, hostMatches, parseOpenUri, unwrapRedirect } from './uri'

describe('parseOpenUri', () => {
  test('full params', () => {
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?host=gpubox&folder=%2Fhome%2Fdev%2Frepo&file=src%2Ftrain.py&line=142&col=7'))
      .toEqual({ host: 'gpubox', folder: '/home/dev/repo', file: 'src/train.py', line: 142, col: 7 })
  })
  test('minimal: file only', () => {
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.py')).toEqual({ file: 'a.py' })
  })
  test('lenient about authority (old links keep working)', () => {
    expect(parseOpenUri('vscode://other.pub/open?file=a.py')).toEqual({ file: 'a.py' })
  })
  test('rejects missing file / wrong path / other schemes', () => {
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?host=x')).toBeNull()
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/other?file=a')).toBeNull()
    expect(parseOpenUri('https://example.com/open?file=a')).toBeNull()
  })
  test('chat + folder, no file (session-launch jump-link shape)', () => {
    expect(
      parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?host=hpc1&folder=%2Fhome%2Fdev%2Frepo&chat=123456789012345678'),
    ).toEqual({ host: 'hpc1', folder: '/home/dev/repo', chat: '123456789012345678' })
  })
  test('chat only', () => {
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?chat=123')).toEqual({ chat: '123' })
  })
  test('tunnel + host + folder (producer-declared live tunnel)', () => {
    expect(
      parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?host=gpubox&folder=%2Fhome%2Fdev%2Frepo&tunnel=gpubox-tunnel'),
    ).toEqual({ host: 'gpubox', folder: '/home/dev/repo', tunnel: 'gpubox-tunnel' })
  })
  test('invalid tunnel names are dropped, rest of params intact', () => {
    const base = 'vscode://c0d3s.control-channel-for-discord/open?host=gpubox&folder=%2Fhome%2Fdev%2Frepo'
    expect(parseOpenUri(`${base}&tunnel=${encodeURIComponent('evil/path')}`)).toEqual({ host: 'gpubox', folder: '/home/dev/repo' })
    expect(parseOpenUri(`${base}&tunnel=${encodeURIComponent('a@b')}`)).toEqual({ host: 'gpubox', folder: '/home/dev/repo' })
    expect(parseOpenUri(`${base}&tunnel=${encodeURIComponent('a+b')}`)).toEqual({ host: 'gpubox', folder: '/home/dev/repo' })
    expect(parseOpenUri(`${base}&tunnel=`)).toEqual({ host: 'gpubox', folder: '/home/dev/repo' })
    expect(parseOpenUri(`${base}&tunnel=${'a'.repeat(65)}`)).toEqual({ host: 'gpubox', folder: '/home/dev/repo' })
  })
  test('notebook cell + range params', () => {
    expect(
      parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=analysis.ipynb&cell=5&line=3&endLine=7'),
    ).toEqual({ file: 'analysis.ipynb', cell: 5, line: 3, endLine: 7 })
    expect(
      parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.py&line=12&col=5&endLine=34&endCol=8'),
    ).toEqual({ file: 'a.py', line: 12, col: 5, endLine: 34, endCol: 8 })
  })
  test('cell is dropped for non-notebook files and invalid values', () => {
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.py&cell=5')).toEqual({ file: 'a.py' })
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.ipynb&cell=abc')).toEqual({ file: 'a.ipynb' })
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?cell=5&chat=123')).toEqual({ chat: '123' })
  })
  test('endLine requires line; endCol requires endLine', () => {
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.py&endLine=7')).toEqual({ file: 'a.py' })
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.py&line=3&endCol=9')).toEqual({ file: 'a.py', line: 3 })
    expect(parseOpenUri('vscode://c0d3s.control-channel-for-discord/open?file=a.py&line=3&endLine=x')).toEqual({ file: 'a.py', line: 3 })
  })
  test('invalid host values are dropped, rest of params intact (authority hardening)', () => {
    const tail = 'folder=%2Fhome%2Fdev%2Frepo&file=a.py'
    expect(parseOpenUri(`vscode://c0d3s.control-channel-for-discord/open?host=${encodeURIComponent('evil+inject')}&${tail}`))
      .toEqual({ folder: '/home/dev/repo', file: 'a.py' })
    expect(parseOpenUri(`vscode://c0d3s.control-channel-for-discord/open?host=${encodeURIComponent('a/b')}&${tail}`))
      .toEqual({ folder: '/home/dev/repo', file: 'a.py' })
    expect(parseOpenUri(`vscode://c0d3s.control-channel-for-discord/open?host=${'h'.repeat(129)}&${tail}`))
      .toEqual({ folder: '/home/dev/repo', file: 'a.py' })
    // Legit spellings survive
    expect(parseOpenUri(`vscode://c0d3s.control-channel-for-discord/open?host=gpubox.local&${tail}`))
      .toEqual({ host: 'gpubox.local', folder: '/home/dev/repo', file: 'a.py' })
    expect(parseOpenUri(`vscode://c0d3s.control-channel-for-discord/open?host=dev%40gpubox&${tail}`))
      .toEqual({ host: 'dev@gpubox', folder: '/home/dev/repo', file: 'a.py' })
    expect(parseOpenUri(`vscode://c0d3s.control-channel-for-discord/open?host=192.168.1.5&${tail}`))
      .toEqual({ host: '192.168.1.5', folder: '/home/dev/repo', file: 'a.py' })
  })
})

describe('build + roundtrip', () => {
  const p = { host: 'gpubox', folder: '/home/dev/repo', file: 'src/train.py', line: 142 }
  test('buildOpenUri uses frozen authority and roundtrips', () => {
    const uri = buildOpenUri(p)
    expect(uri.startsWith(`vscode://${AUTHORITY}/open?`)).toBe(true)
    expect(parseOpenUri(uri)).toEqual(p)
  })
  test('redirect wraps and unwraps', () => {
    const url = buildRedirectUrl(p)
    expect(url.startsWith('https://vscode.dev/redirect?url=vscode%3A%2F%2F')).toBe(true)
    expect(parseOpenUri(unwrapRedirect(url)!)).toEqual(p)
  })
  test('unwrapRedirect rejects non-vscode inner urls', () => {
    expect(unwrapRedirect('https://vscode.dev/redirect?url=https%3A%2F%2Fevil.com')).toBeNull()
    expect(unwrapRedirect('https://example.com/redirect?url=vscode%3A%2F%2Fx')).toBeNull()
  })
  test('chat param round-trips alongside folder, no file', () => {
    const jump = { host: 'hpc1', folder: '/home/dev/code/repo', chat: '123456789012345678' }
    const uri = buildOpenUri(jump)
    expect(uri).not.toContain('file=')
    expect(parseOpenUri(uri)).toEqual(jump)
  })
  test('tunnel param round-trips alongside host/folder/chat', () => {
    const jump = { host: 'gpubox', folder: '/home/dev/repo', chat: '123', tunnel: 'gpubox-tunnel' }
    const uri = buildOpenUri(jump)
    expect(uri).toContain('tunnel=gpubox-tunnel')
    expect(parseOpenUri(uri)).toEqual(jump)
  })
  test('cell + range params round-trip', () => {
    const nb = { file: 'analysis.ipynb', cell: 5, line: 3, endLine: 7 }
    expect(parseOpenUri(buildOpenUri(nb))).toEqual(nb)
    const range = { file: 'a.py', line: 12, col: 5, endLine: 34, endCol: 8 }
    expect(parseOpenUri(buildOpenUri(range))).toEqual(range)
  })
})

describe('hostMatches', () => {
  const local = { localHostname: 'thinkpad.lan' }
  test('undefined target matches current window', () => {
    expect(hostMatches(undefined, local)).toBe(true)
  })
  test('local hostname, short-name and case-insensitive', () => {
    expect(hostMatches('THINKPAD', local)).toBe(true)
    expect(hostMatches('gpubox', local)).toBe(false)
  })
  test('ssh remote authority', () => {
    const cur = { remoteAuthority: 'ssh-remote+gpubox', localHostname: 'thinkpad' }
    expect(hostMatches('gpubox', cur)).toBe(true)
    expect(hostMatches('thinkpad', cur)).toBe(false) // window is attached to gpubox
  })
  test('tunnel authority and aliases', () => {
    expect(hostMatches('mybox', { remoteAuthority: 'tunnel+mybox', localHostname: 'x' })).toBe(true)
    expect(hostMatches('devbox', { localHostname: 'ip-10-0-0-1', aliases: ['devbox'] })).toBe(true)
  })
  test('IPv4 literals compare whole, not by first octet', () => {
    expect(hostMatches('10.1.2.3', { localHostname: '10.9.9.9' })).toBe(false)
    expect(hostMatches('10.1.2.3', { localHostname: '10.1.2.3' })).toBe(true)
    expect(hostMatches('10.1.2.3', { remoteAuthority: 'ssh-remote+10.9.9.9', localHostname: 'laptop' })).toBe(false)
    expect(hostMatches('10.1.2.3', { remoteAuthority: 'ssh-remote+10.1.2.3', localHostname: 'laptop' })).toBe(true)
  })
  test('tunnel name matches the tunnel window it names, even when host does not', () => {
    const inTunnel = { remoteAuthority: 'tunnel+gpubox-tunnel', localHostname: 'laptop' }
    expect(hostMatches('gpubox', inTunnel, 'gpubox-tunnel')).toBe(true)
    expect(hostMatches('gpubox', inTunnel)).toBe(false) // without the tunnel param: still no match
    expect(hostMatches('gpubox', inTunnel, 'other-box')).toBe(false)
    expect(hostMatches('gpubox', { localHostname: 'gpubox' }, 'gpubox-tunnel')).toBe(true) // local match unaffected
  })
  test('aliases are consulted in remote windows too', () => {
    const win = { remoteAuthority: 'ssh-remote+192.168.1.5', localHostname: 'laptop', aliases: ['gpubox'] }
    expect(hostMatches('gpubox', win)).toBe(true)
    expect(hostMatches('otherbox', win)).toBe(false)
  })
  test('IPv4 literals in aliases compare whole, not by first octet', () => {
    expect(hostMatches('10.1.2.3', { localHostname: 'laptop', aliases: ['10.1.2.3'] })).toBe(true)
    expect(hostMatches('10.9.9.9', { localHostname: 'laptop', aliases: ['10.1.2.3'] })).toBe(false)
  })
})
