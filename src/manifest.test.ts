import { describe, expect, it } from 'vitest'
import pkg from '../package.json'

type View = { id: string; name: string; type?: string; visibility?: string; initialSize?: number; when?: string }
const views = pkg.contributes.views as Record<string, View[]>
const sidebar = views['discordVscode']

describe('sidebar container layout (package.json contributes.views.discordVscode)', () => {
  it('orders views Activity, Channels, Chat', () => {
    expect(sidebar.map((v) => v.id)).toEqual([
      'discordVscode.activity',
      'discordVscode.channels',
      'discordVscode.chat',
    ])
  })

  it('Activity is always present at minimum height; Chat is hidden until a channel is opened', () => {
    const byId = Object.fromEntries(sidebar.map((v) => [v.id, v]))
    expect(byId['discordVscode.activity'].when).toBeUndefined()
    expect(byId['discordVscode.activity'].initialSize).toBe(1)
    expect(byId['discordVscode.channels'].initialSize).toBe(15)
    expect(byId['discordVscode.chat'].when).toBe('discordVscode.chatOpened')
  })

  it('hides the Chat view until a channel is opened, then gives it half the sidebar (16 of 32)', () => {
    const chat = sidebar.find((v) => v.id === 'discordVscode.chat')!
    expect(chat.visibility).toBeUndefined()
    expect(chat.when).toBe('discordVscode.chatOpened')
    expect(chat.initialSize).toBe(16)
    const total = sidebar.reduce((n, v) => n + (v.initialSize ?? 20), 0)
    expect(chat.initialSize! / total).toBe(0.5)
  })
})

describe('right dock container (package.json contributes.viewsContainers)', () => {
  const containers = pkg.contributes.viewsContainers as Record<string, { id: string; title: string }[]>
  it('is contributed to the secondary side bar, not the activity bar', () => {
    expect(containers.secondarySidebar.map((c) => c.id)).toEqual(['discordVscodeDockRight'])
    expect(containers.secondarySidebar[0].title).toBe('Discord Chat')
    expect(containers.activitybar.map((c) => c.id)).toEqual(['discordVscode'])
  })
  it('requires a VS Code that has the secondarySidebar contribution (finalized in 1.106)', () => {
    expect(pkg.engines.vscode).toBe('^1.106.0')
  })
})

describe('tree inline button target (package.json)', () => {
  const cfg = pkg.contributes.configuration.properties as Record<string, { enum?: string[]; default?: unknown }>
  const inline = (pkg.contributes.menus['view/item/context'] as { command: string; when: string; group?: string }[])
    .filter((e) => e.group === 'inline' && !e.when.includes('discordVscode.activity'))
  it('is a user setting defaulting to the right dock', () => {
    expect(cfg['discordVscode.treeButtonTarget'].enum).toEqual(['right', 'bottom', 'sidebar', 'popOut'])
    expect(cfg['discordVscode.treeButtonTarget'].default).toBe('right')
  })
  it('shows exactly one inline button per setting value, each on text channels and threads', () => {
    const byValue: Record<string, string> = {
      right: 'discordVscode.openInRightDock', bottom: 'discordVscode.openInBottomDock',
      sidebar: 'discordVscode.openChannel', popOut: 'discordVscode.popOutChannel',
    }
    for (const [value, command] of Object.entries(byValue)) {
      const hits = inline.filter((e) => e.when.includes(`config.discordVscode.treeButtonTarget == '${value}'`))
      expect(hits.map((e) => e.command)).toEqual([command])
      expect(hits[0].when).toContain("viewItem =~ /^(text|thread)(-silenced)?$/")
    }
    expect(inline).toHaveLength(4)
  })
  it('every inline command has an icon', () => {
    const commands = pkg.contributes.commands as { command: string; icon?: string }[]
    for (const e of inline) expect(commands.find((c) => c.command === e.command)?.icon).toBeTruthy()
  })
})

describe('activity view menus (package.json)', () => {
  const menus = pkg.contributes.menus as Record<string, { command: string; when: string; group?: string }[]>
  it('has the Clear and Hide button on the sidebar Chat title bar', () => {
    const e = menus['view/title'].find((x) => x.command === 'discordVscode.clearSidebarChat')!
    expect(e.when).toBe('view == discordVscode.chat')
    expect((pkg.contributes.commands as { command: string; icon?: string }[]).find((c) => c.command === 'discordVscode.clearSidebarChat')?.icon).toBe('$(clear-all)')
  })
  it('mirrors the tree inline button set on activity rows, one per treeButtonTarget value', () => {
    const inline = menus['view/item/context'].filter((x) => x.group === 'inline' && x.when.includes('discordVscode.activity'))
    expect(inline.map((x) => x.command).sort()).toEqual(
      ['discordVscode.openChannel', 'discordVscode.openInBottomDock', 'discordVscode.openInRightDock', 'discordVscode.popOutChannel'].sort(),
    )
    for (const x of inline) {
      expect(x.when).toContain('viewItem =~ /^activity-(text|thread)$/')
      expect(x.when).toMatch(/config\.discordVscode\.treeButtonTarget == '(right|bottom|sidebar|popOut)'/)
    }
  })
  it('offers dock / pin / silence in the activity row context menu', () => {
    const ctx = menus['view/item/context'].filter((x) => x.group !== 'inline' && x.when.includes('discordVscode.activity')).map((x) => x.command).sort()
    expect(ctx).toEqual(['discordVscode.openInBottomDock', 'discordVscode.openInRightDock', 'discordVscode.pinChannel', 'discordVscode.silenceChannel'].sort())
  })
})

describe('activity window setting (package.json)', () => {
  it('defaults to 15 minutes', () => {
    const cfg = pkg.contributes.configuration.properties as Record<string, { default?: unknown; minimum?: number }>
    expect(cfg['discordVscode.activityWindowMinutes'].default).toBe(15)
    expect(cfg['discordVscode.activityWindowMinutes'].minimum).toBe(0)
  })
})
