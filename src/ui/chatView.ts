import * as vscode from 'vscode'
import { ChannelNode } from '../shared/types'
import { ServiceEvent } from '../discord/service'
import { ChatDeps, ChatSession, chatHtml } from './chatSession'

/** Context key gating the sidebar Chat view (package.json `when`). The view is
 *  absent until the first channel is opened in a session, and is then ADDED to
 *  the container — which is the one moment VS Code sizes a view by its
 *  `initialSize` weight (an initially-collapsed view expands to its minimum
 *  height instead; there is no API to resize panes later). */
const CHAT_OPENED_KEY = 'discordVscode.chatOpened'

export class ChatViewProvider implements vscode.WebviewViewProvider {
  static readonly viewId = 'discordVscode.chat'
  private session: ChatSession | null = null
  private pending: ChannelNode | null = null

  constructor(
    private extensionUri: vscode.Uri,
    private deps: ChatDeps,
    private onDropped?: (channelId: string) => void,
  ) {}

  get currentChannelId(): string | null {
    return this.session?.channelId ?? this.pending?.id ?? null
  }

  resolveWebviewView(view: vscode.WebviewView) {
    view.webview.options = { enableScripts: true, localResourceRoots: [this.extensionUri] }
    view.webview.html = chatHtml(view.webview, this.extensionUri)
    this.session = new ChatSession(view.webview, this.deps, {
      onDropChannel: (id, name) => {
        this.pending = { id, name, kind: 'text', parentId: null, position: 0 }
        void this.session?.setChannel(id, name)
        this.onDropped?.(id)
      },
    })
    const session = this.session
    // The view is disposed whenever the when-clause hides it; drop the dead session
    // so a later openChannel doesn't post into a disposed webview.
    view.onDidDispose(() => {
      if (this.session === session) this.session = null
    })
    if (this.pending) void session.setChannel(this.pending.id, this.pending.name)
  }

  /** Blank the sidebar chat and hide the view (the channel moved to a dock).
   *  The next openChannel re-adds the view as usual. */
  async clear(): Promise<void> {
    this.pending = null
    this.session?.clear()
    await vscode.commands.executeCommand('setContext', CHAT_OPENED_KEY, false)
  }

  async openChannel(node: ChannelNode) {
    this.pending = node
    await vscode.commands.executeCommand('setContext', CHAT_OPENED_KEY, true)
    await vscode.commands.executeCommand(`${ChatViewProvider.viewId}.focus`)
    if (this.session) await this.session.setChannel(node.id, node.name)
  }

  handleServiceEvent(ev: ServiceEvent) {
    this.session?.handleServiceEvent(ev)
  }
}
