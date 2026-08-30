import * as vscode from 'vscode'
import { buildPinnedSection } from '../shared/pinned'
import { ChannelNode } from '../shared/types'

export class ChannelTree implements vscode.TreeDataProvider<ChannelNode>, vscode.TreeDragAndDropController<ChannelNode> {
  private changed = new vscode.EventEmitter<ChannelNode | undefined>()
  readonly onDidChangeTreeData = this.changed.event
  private unread = new Set<string>()

  readonly dragMimeTypes = ['application/x-discord-vscode-channel', 'text/plain']
  readonly dropMimeTypes: string[] = []

  constructor(
    private snapshot: () => ChannelNode[],
    private hidden: () => string[],
    private pinnedIds: () => string[],
    private silencedIds: () => string[],
  ) {}

  handleDrag(source: readonly ChannelNode[], dt: vscode.DataTransfer): void {
    const node = source[0]
    if (!node || (node.kind !== 'text' && node.kind !== 'thread')) return
    const payload = JSON.stringify({ id: node.id, name: node.name, kind: node.kind })
    dt.set('application/x-discord-vscode-channel', new vscode.DataTransferItem(payload))
    dt.set('text/plain', new vscode.DataTransferItem(payload))
  }

  refresh() {
    this.changed.fire(undefined)
  }
  markUnread(channelId: string) {
    this.unread.add(channelId)
    this.changed.fire(undefined)
  }
  clearUnread(channelId: string) {
    this.unread.delete(channelId)
    this.changed.fire(undefined)
  }

  getTreeItem(node: ChannelNode): vscode.TreeItem {
    if (node.id === 'pin-root') {
      const root = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded)
      root.id = 'pin-root'
      root.iconPath = new vscode.ThemeIcon('pinned')
      return root
    }
    const isLeaf = node.kind === 'thread'
    const hasChildren = node.kind !== 'thread' && node.kind !== 'voice' &&
      this.snapshot().some((n) => n.parentId === node.id && !this.hidden().includes(n.name))
    const item = new vscode.TreeItem(
      node.name,
      node.kind === 'category'
        ? vscode.TreeItemCollapsibleState.Expanded
        : hasChildren
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None,
    )
    item.id = (node.pinned ? 'pin:' : '') + node.id
    item.iconPath = new vscode.ThemeIcon(
      node.kind === 'category' ? 'folder'
        : node.kind === 'thread' ? 'comment-discussion'
        : node.kind === 'voice' ? 'unmute'
        : 'comment',
    )
    if (node.kind === 'voice') {
      item.command = { command: 'discordVscode.openVoiceChannel', title: 'Open in Discord', arguments: [node] }
      item.contextValue = 'voice'
      const occupants = node.occupants ?? []
      if (occupants.length) {
        item.description = `(${occupants.length})`
        item.tooltip = occupants.join(', ')
      }
    } else if (node.kind !== 'category') {
      item.command = { command: 'discordVscode.openChannel', title: 'Open', arguments: [node] }
      item.contextValue = node.pinned
        ? 'pin-' + node.kind
        : node.kind + (this.silencedIds().includes(node.id) ? '-silenced' : '')
      if (this.unread.has(node.id)) item.description = '●'
    }
    void isLeaf
    return item
  }

  getChildren(node?: ChannelNode): ChannelNode[] {
    const all = this.snapshot().filter((n) => !this.hidden().includes(n.name))
    if (!node) {
      const top = all.filter((n) => n.kind === 'category' || n.parentId === null)
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position || a.name.localeCompare(b.name))
      const pins = buildPinnedSection(all, this.pinnedIds())
      if (!pins.length) return top
      const pinRoot: ChannelNode = { id: 'pin-root', name: '📌 Pinned', kind: 'category', parentId: null, position: -1, pinned: true }
      return [pinRoot, ...top]
    }
    if (node.id === 'pin-root')
      return buildPinnedSection(all, this.pinnedIds()).map((e) => ({ ...e.node, pinned: true }))
    if (node.pinned && node.kind === 'text') {
      const entry = buildPinnedSection(all, this.pinnedIds()).find((e) => e.node.id === node.id)
      return (entry?.children ?? []).map((t) => ({ ...t, pinned: true }))
    }
    const kids = all.filter((n) => n.parentId === node.id)
    return kids.sort((a, b) => a.kind.localeCompare(b.kind) || a.position - b.position || a.name.localeCompare(b.name))
  }
}
