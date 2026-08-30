import * as vscode from 'vscode'
import { ChannelNode } from '../shared/types'
import { ServiceEvent } from '../discord/service'
import { ChatDeps, ChatSession, chatHtml } from './chatSession'

export type PopOutPlacement = 'beside' | 'active' | 'below'

export class ChatPanelManager {
  private open = new Map<string, { panel: vscode.WebviewPanel; session: ChatSession }>()

  constructor(
    private extensionUri: vscode.Uri,
    private deps: ChatDeps,
  ) {}

  async popOut(node: ChannelNode, placement: PopOutPlacement = 'beside'): Promise<void> {
    const existing = this.open.get(node.id)
    if (existing) {
      existing.panel.reveal()
      return
    }
    // createWebviewPanel has no "below" column — create the group first, then open
    // into the now-active group.
    if (placement === 'below') await vscode.commands.executeCommand('workbench.action.newGroupBelow')
    const column = placement === 'beside' ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active
    const panel = vscode.window.createWebviewPanel(
      'discordVscode.chatPanel',
      node.kind === 'thread' ? `🧵 ${node.name}` : `# ${node.name}`,
      column,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this.extensionUri] },
    )
    panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.svg')
    panel.webview.html = chatHtml(panel.webview, this.extensionUri)
    let boundId = node.id
    const session = new ChatSession(panel.webview, this.deps, {
      onChannelSwitched: (id, name) => {
        if (id === boundId) return
        this.open.delete(boundId)
        boundId = id
        this.open.set(id, { panel, session })
        // Session-initiated switches only happen via /thread today → thread glyph.
        panel.title = `🧵 ${name}`
      },
    })
    void session.setChannel(node.id, node.name)
    panel.onDidDispose(() => this.open.delete(boundId))
    this.open.set(node.id, { panel, session })
  }

  isOpen(channelId: string): boolean {
    return this.open.has(channelId)
  }

  openChannelIds(): string[] {
    return [...this.open.keys()]
  }

  handleServiceEvent(ev: ServiceEvent) {
    for (const { session } of this.open.values()) session.handleServiceEvent(ev)
  }

  dispose() {
    for (const { panel } of this.open.values()) panel.dispose()
  }
}
