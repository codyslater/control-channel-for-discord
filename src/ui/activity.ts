import * as vscode from 'vscode'
import {
  ActivityEntry, applyMessage, markRead, rankActivity, relativeTime, seedActivity, unreadTotal,
} from '../shared/activity'
import { ChannelNode, ChatMessage } from '../shared/types'

const ENTRIES_KEY = 'discordVscode.activityEntries'
const LAST_READ_KEY = 'discordVscode.activityLastRead'

export type ActivityRow = ChannelNode & { activity: ActivityEntry }

/** Recent-activity feed: every text channel/thread with a known last message,
 *  mentions first then newest, with author/preview and unread counts. Rows are
 *  ChannelNodes so the tree's commands (open, dock, pop out, pin, silence) apply
 *  unchanged. Feed and last-read times persist in globalState. Passive: never
 *  takes focus; the view badge carries the unread total. */
export class ActivityView {
  private entries: ActivityEntry[]
  private lastRead: Record<string, number>
  private changed = new vscode.EventEmitter<ActivityRow | undefined>()
  private view: vscode.TreeView<ActivityRow>
  private timer: ReturnType<typeof setInterval>
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private lookup: (id: string) => ChannelNode | undefined,
    private state: vscode.Memento,
    /** Minutes of recency a read entry stays listed; 0 = forever. */
    private windowMinutes: () => number,
  ) {
    this.entries = state.get<ActivityEntry[]>(ENTRIES_KEY, [])
    this.lastRead = state.get<Record<string, number>>(LAST_READ_KEY, {})
    this.view = vscode.window.createTreeView('discordVscode.activity', {
      treeDataProvider: {
        onDidChangeTreeData: this.changed.event,
        getTreeItem: (r: ActivityRow) => this.item(r),
        getChildren: (r?: ActivityRow) => (r ? [] : this.rows()),
      },
    })
    // Relative times ("3m") drift; re-render once a minute while visible.
    this.timer = setInterval(() => {
      if (this.view.visible) this.changed.fire(undefined)
    }, 60_000)
    this.refresh()
  }

  private rows(): ActivityRow[] {
    const out: ActivityRow[] = []
    for (const e of rankActivity(this.entries, { now: Date.now(), windowMs: this.windowMinutes() * 60_000 })) {
      const node = this.lookup(e.channelId)
      if (node && (node.kind === 'text' || node.kind === 'thread')) out.push({ ...node, activity: e })
    }
    return out
  }

  private item(r: ActivityRow): vscode.TreeItem {
    const e = r.activity
    const name = (r.kind === 'thread' ? '🧵 ' : '# ') + r.name
    const suffix = e.unread ? ` (${e.unread})` : e.unreadSince ? ' •' : ''
    const label: vscode.TreeItemLabel = {
      label: name + suffix,
      highlights: e.unread || e.unreadSince ? [[0, name.length]] : [],
    }
    const item = new vscode.TreeItem(label)
    item.id = 'activity:' + r.id
    const parent = r.kind === 'thread' && r.parentId ? this.lookup(r.parentId)?.name : undefined
    const when = relativeTime(Date.now(), e.lastAt)
    const preview = e.lastPreview ? `${e.lastAuthor}: ${e.lastPreview}` : parent ? `#${parent}` : ''
    item.description = preview ? `${preview} · ${when}` : when
    // Built with appendText (which escapes markdown) for the channel name and the
    // untrusted author/preview, so injected `[label](url)` / `![img](url)` in a
    // message can't render as a link or beacon in the hover tooltip.
    const tip = new vscode.MarkdownString()
    tip.appendText(name + (parent ? ` in #${parent}` : ''))
    if (e.lastPreview) tip.appendText(`\n\n${e.lastAuthor}: ${e.lastPreview}`)
    tip.appendText(`\n\n${new Date(e.lastAt).toLocaleString()}`)
    item.tooltip = tip
    if (e.mentioned) item.iconPath = new vscode.ThemeIcon('mention')
    else if (e.unread || e.unreadSince) item.iconPath = new vscode.ThemeIcon('circle-filled')
    item.contextValue = 'activity-' + r.kind
    item.command = { command: 'discordVscode.openFromActivity', title: 'Open', arguments: [r.id] }
    return item
  }

  applyMessage(m: ChatMessage, o: { track: boolean; mentionsMe: boolean }) {
    this.entries = applyMessage(this.entries, m, o)
    // A message in a channel that's open here is read as it arrives.
    if (!o.track) this.lastRead[m.channelId] = Math.max(this.lastRead[m.channelId] ?? 0, m.createdAt)
    this.refresh()
  }

  markRead(channelId: string) {
    const e = this.entries.find((x) => x.channelId === channelId)
    this.lastRead[channelId] = Math.max(this.lastRead[channelId] ?? 0, e?.lastAt ?? 0, Date.now())
    this.entries = markRead(this.entries, channelId)
    this.refresh()
  }

  /** Silenced channels leave the feed entirely. */
  remove(channelId: string) {
    this.entries = this.entries.filter((x) => x.channelId !== channelId)
    this.refresh()
  }

  seed(nodes: ChannelNode[]) {
    const seeds = nodes.flatMap((n) =>
      n.lastAt && (n.kind === 'text' || n.kind === 'thread') ? [{ channelId: n.id, lastAt: n.lastAt }] : [],
    )
    this.entries = seedActivity(this.entries, seeds, this.lastRead)
    this.refresh()
  }

  /** Re-render only (e.g. the window setting changed). */
  refreshView() {
    this.changed.fire(undefined)
  }

  private refresh() {
    this.changed.fire(undefined)
    const total = unreadTotal(this.entries)
    this.view.badge = total ? { value: total, tooltip: `${total} unread` } : undefined
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void this.state.update(ENTRIES_KEY, rankActivity(this.entries))
      void this.state.update(LAST_READ_KEY, this.lastRead)
    }, 500)
  }

  dispose() {
    clearInterval(this.timer)
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.view.dispose()
  }
}
